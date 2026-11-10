# 构建、打包与首版发布

首版正式支持且只支持三个目标（brief 约束 5）：

| 目标 | 构建机（GitHub Actions） | 产物 |
| --- | --- | --- |
| `win32-x64` | `windows-2022` | `HUHU-<版本>-win32-x64-setup.exe`（NSIS，按用户安装，可选安装目录） |
| `darwin-arm64` | `macos-14`（Apple Silicon） | `HUHU-<版本>-darwin-arm64.dmg` |
| `linux-x64` | `ubuntu-22.04` | `HUHU-<版本>-linux-x64.AppImage`、`HUHU-<版本>-linux-x64.deb` |

每个目标在本平台原生构建，不交叉编译。不签名、不公证、不提供自动更新（D-25）。

## 1. 构建链

- `pnpm install --frozen-lockfile` → `pnpm build`（turbo 不引入；用 pnpm `-r --filter` 按依赖顺序构建：`vendor/*`、`packages/*`、`plugins/*`、`apps/engine`、`apps/cli`、`apps/desktop`）。
- `apps/desktop` 用 electron-vite 产出 `out/main`、`out/preload`、`out/renderer`；Engine 与外部插件宿主作为 main 的额外入口（R-01，参照 OK `electron.vite.config.ts` 中 utility 入口）。
- CLI：`apps/cli` 打包为单文件 ESM `cli.mjs`，随应用放入 `resources/cli/`；启动脚本 `resources/bin/huhu`（POSIX sh）与 `resources/bin/huhu.cmd`（Windows）以 `ELECTRON_RUN_AS_NODE=1` 调用应用自身的 Electron 二进制运行 `cli.mjs`（参照 OK `electron-builder.yml` 把 CLI 放进 `extraResources` 的做法）。
- Herdr Core：`scripts/fetch-herdr.mjs` 按 `herdr.lock.json`（版本 0.1.19、每个目标的下载 URL 与 SHA-256）下载官方发布包，校验哈希后解压到 `apps/desktop/resources/herdr/<target>/`（Windows 包含 `herdr-core.exe` 与随附 ConPTY 文件），作为 `extraResources` 打包。哈希不符则构建失败。W12 首次锁定时记录官方发布页的实际 URL 与哈希。
- 原生模块：只有 `@parcel/watcher`（及 ssh2 的可选 `cpu-features`，缺失时 ssh2 自动回退纯 JS）。按 OK `scripts/stage-parcel-watcher.mjs` 与 `prepare-platform-natives.mjs` 的方式只暂存当前目标平台的预编译包；`asarUnpack: ["**/*.node", "**/@parcel/watcher*/**"]`。不使用 `electron-rebuild`（没有需要针对 Electron ABI 编译的模块）。
- `electron-builder.yml`（R-01）：`appId: dev.huhu.workbench`、`productName: HUHU`、`electronVersion` 与 package.json 一致、`files` 排除 sourcemap 与 TS 源、`extraResources`（cli、bin、herdr/<target>、demo-vault、examples/plugins、LICENSE、THIRD_PARTY_NOTICES.md）、`win.target: nsis (x64)`、`nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true }`、`mac.target: dmg (arm64)`、`mac.identity: null`、`linux.target: [AppImage, deb] (x64)`、`linux.category: Office`。`artifactName: HUHU-${version}-${os}-${arch}.${ext}` 并在脚本中把 `os` 规范为 `win32/darwin/linux`。

## 2. 版本号

- 语义化版本，单一来源为根 `package.json` 的 `version`；`scripts/sync-version.mjs` 写入各 workspace 包与 `apps/desktop/package.json`。首版为 `1.0.0`（原型的 v9 是原型迭代号，不沿用）。
- 构建时把版本、Git 提交、构建时间写入 `apps/desktop/out/build-info.json`，“关于”页与 `huhu --version` 读取。
- 数据格式版本（`formatVersion`、各 kind `schema`）与应用版本独立。

## 3. 运行时目录

| 内容 | 位置 |
| --- | --- |
| 应用本体 | Windows `%LOCALAPPDATA%\Programs\HUHU`；macOS `/Applications/HUHU.app`；Linux AppImage 任意位置 / deb `/opt/HUHU` |
| 所有用户数据 | 用户选择的 Vault 目录（data-model §2） |
| Electron 自身缓存 | Electron 默认 `userData`（`app.getPath('userData')`）中的 Chromium 缓存；HUHU 不在此写业务数据或最近列表（D-26） |

卸载应用不删除任何 Vault。

## 4. CI

`.github/workflows/ci.yml`（每次推送与 PR）：矩阵三平台 → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test`（单元与集成）→ `pnpm build` → `pnpm e2e`（Playwright 启动打包前的 Electron 构建；Linux 用 `xvfb-run`）。

`.github/workflows/release.yml`（推送 `v*` 标签触发）：矩阵三平台 → 同上全部检查 → `pnpm fetch:herdr` → `pnpm dist`（electron-builder `--publish never`）→ 产物冒烟（§5）→ 生成 `SHA256SUMS-<target>.txt` → 上传 Actions artifacts；最后一个 job 汇总三个目标的产物与合并的 `SHA256SUMS.txt`，创建 GitHub Release 草稿（人工审阅后发布）。

## 5. 发布验证

每个目标必须全部通过，记录在 Release 草稿说明中：

| 检查 | 方法 |
| --- | --- |
| 产物完整性 | `sha256sum -c SHA256SUMS.txt` |
| 安装/启动/退出 | CI 冒烟：Windows 静默安装 NSIS（`/S`）后启动安装目录中的 exe；macOS 挂载 DMG 拷出 `.app` 后执行；Linux 执行 AppImage（`--appimage-extract-and-run`）。Playwright `_electron.launch` 打开示例 Vault，确认工作台出现后关闭，进程在 10 秒内全部退出（检查无残留 Engine 进程；Herdr Core 允许保留） |
| 关键功能 | 打包后的 E2E 子集（`tests/e2e/packaged/`）：创建笔记并保存；新建任务并勾选；运行内置扫描规则（fake provider）；启动“新终端”执行 `echo ok` 并读到输出（验证 Herdr 二进制与命名管道/socket）；导出数据包 |
| 运行时依赖 | 启动后由健康中心诊断能力（`health.run`，通过 CLI 调用）确认 Herdr Core、文件监听原生模块可用 |
| CLI | `resources/bin/huhu --version` 输出与应用版本一致；`huhu call vault.info --vault <示例 Vault>` 返回 ok |
| 未签名提示 | Release 说明写明：Windows SmartScreen 选择“仍要运行”；macOS 首次打开需右键“打开”或执行 `xattr -dr com.apple.quarantine /Applications/HUHU.app`；Linux AppImage 需 `chmod +x` |

手动验证（发布前由维护者在三台实机各做一次，结果写入 Release 说明）：中文输入法在实时预览与终端中输入；Claude Code 或 Codex 真实启动一次并在 HUHU 中看到会话历史；连接一台真实 SSH 主机；Git 远端同步一次。

## 6. 平台差异清单（发布前逐项验证）

| 项 | Windows x64 | macOS arm64 | Linux x64 |
| --- | --- | --- | --- |
| Herdr Core 端点 | 命名管道 | Unix socket（路径长度 < 104 字节） | Unix socket（< 108 字节） |
| CLI 安装 | 用户 PATH 加入 `resources\bin` | `~/.local/bin/huhu` 符号链接 | 同 macOS；deb 安装可放 `/usr/bin/huhu` 链接（postinst） |
| 进程树结束 | AA PowerShell job 监督（R-31） | 进程组 | 进程组 |
| 文件监听 | @parcel/watcher（ReadDirectoryChangesW） | FSEvents | inotify；监听上限不足时回退轮询并在健康中心提示 |
| 路径 | 盘符、反斜杠、260 字符限制（启用长路径前缀 `\\?\`） | NFD → NFC | 大小写敏感 |
| 系统 Git | 不随应用打包；需用户安装 Git for Windows | Xcode Command Line Tools 或 Homebrew git | 发行版 git 包 |
