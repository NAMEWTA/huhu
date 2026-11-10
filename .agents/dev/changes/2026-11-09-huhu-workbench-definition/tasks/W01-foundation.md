# W01 工程基线

## W01.1 建立 pnpm monorepo 与工具链

- 目标：克隆仓库后 `pnpm install && pnpm lint && pnpm typecheck && pnpm test` 在三平台通过。
- 依据：[engineering](../engineering.md) §1、§4；[architecture](../architecture.md) §2。
- 前置：无。
- 位置：根 `package.json`、`pnpm-workspace.yaml`、`.node-version`、`tsconfig.base.json`、`oxlint.json`、`.oxfmtrc.json`、`knip.json`、`vitest.workspace.ts`、`LICENSE`（GPL-3.0-or-later）、`docs/upstream/ledger.md`。
- 复用：ORCA 的 oxlint/oxfmt/knip 配置组织方式（`config/oxlint-*.json`、`config/knip.json`）作为起点，只保留通用规则。
- 实现要点：按 engineering §1 创建全部顶层目录与空包（每个包含 `package.json`、`tsconfig.json`、`src/index.ts`）；`tsconfig.base.json` 打开 engineering §3 的严格选项；oxlint 规则包含 `no-explicit-any`、`no-restricted-imports`（深路径与 engine/ui 边界，engineering §2）、禁止 TODO/FIXME、JSX 中文字面量检查；`packageManager` 固定 pnpm 版本；安装时记录全部依赖实际版本到锁文件。
- 异常：Windows 路径与换行（`.gitattributes` 设 `* text=auto eol=lf`，夹具目录中 CRLF 测试文件标记 `-text`）。
- 测试：一个示例单元测试与一个故意违反边界规则的导入在 lint 中失败的检查（`scripts/check-lint-rules.mjs` 断言 oxlint 对样例文件报错）。
- 完成：三条命令在本机通过；违反边界的样例被 lint 拒绝。

## W01.2 Electron 应用骨架（main / preload / renderer）

- 目标：`pnpm dev` 打开一个 HUHU 窗口，显示占位启动页；生产构建可运行。
- 依据：architecture §3；security §1（Renderer → Main 行）。
- 前置：W01.1。
- 位置：`apps/desktop/src/{main,preload,renderer}`、`apps/desktop/electron.vite.config.ts`。
- 复用：R-01、R-02（只取窗口与 utility 入口配置部分）。
- 实现要点：Electron 44.9.1；注册特权协议 `huhu-app://workbench` 加载 Renderer；`BrowserWindow` 选项 `contextIsolation: true, sandbox: true, nodeIntegration: false`、`minWidth: 960, minHeight: 600`；`will-navigate` 与 `setWindowOpenHandler` 拒绝；单实例锁（第二次启动聚焦已有窗口）；Preload 暴露 `huhuHost.appInfo()` 一个方法并校验 `senderFrame.url`；CSP 按 security §1。
- 异常：Renderer 加载失败显示 Main 内置的错误页（含日志路径）。
- 测试：Playwright `_electron` 启动应用，断言窗口标题与 `huhuHost.appInfo()` 返回值；尝试 `window.open('file:///etc/passwd')` 不产生新窗口。
- 完成：dev 与 build 两种模式均可启动；E2E 通过。

## W01.3 CI 三平台矩阵

- 目标：每次推送在 Windows x64、macOS arm64、Linux x64 上运行 lint、typecheck、test、build、e2e。
- 依据：[release](../release.md) §4。
- 前置：W01.2。
- 位置：`.github/workflows/ci.yml`。
- 复用：无（GitHub Actions 标准写法）。
- 实现要点：`runs-on` 为 `windows-2022`、`macos-14`、`ubuntu-22.04`；pnpm store 缓存；Linux E2E 用 `xvfb-run`；失败时上传 Playwright trace 为 artifact。
- 异常：单个平台失败不取消其他平台（`fail-fast: false`）。
- 测试：CI 自身。
- 完成：主分支三平台全绿。

## W01.4 三平台安装包冒烟

- 目标：尽早确认三平台都能产出未签名安装包并启动。
- 依据：release §1、§5。
- 前置：W01.3。
- 位置：`apps/desktop/electron-builder.yml`、`.github/workflows/release.yml`（先只做 `workflow_dispatch`）、`scripts/checksums.mjs`。
- 复用：R-01。
- 实现要点：按 release §1 配置目标与 `artifactName`；`mac.identity: null`；生成 `SHA256SUMS-<target>.txt`；冒烟脚本按 release §5 安装并启动、10 秒内退出。
- 异常：macOS 未签名应用在 CI 中启动需清除 quarantine 属性（`xattr -dr`）。
- 测试：release workflow 冒烟步骤。
- 完成：手动触发 workflow 产出 4 个安装包与校验文件，三平台冒烟通过。

## W01.5 testkit 与夹具

- 目标：后续所有集成测试有统一的夹具与启动器。
- 依据：[quality](../quality.md) §1。
- 前置：W01.1。
- 位置：`packages/testkit/src/{fixtures,fake-provider,fake-ssh-server,temp-vault.ts}`。
- 复用：R-12（把原型 `examples/demo-vault` 复制为 `fixtures/demo-vault`，按 data-model §5 修正字段：删除 `revision`、`bodyPresent`、`prototype` 等原型字段；`Task Runs` 增加必需字段）。
- 实现要点：`tempVault(fixtureName)` 复制夹具到临时目录并在测试结束删除；`edge-vault` 按 quality §1 构造；`scale-vault` 生成脚本；fake provider 与 fake SSH 服务器先实现最小功能（W13、W14 扩展）。
- 异常：Windows 下符号链接夹具需要开发者模式，测试在无权限时跳过并打印原因。
- 测试：夹具中所有语义文件可被 W04 的解析器解析（W04.3 完成后启用的断言）。
- 完成：`tempVault('demo-vault')` 可用；夹具内容与 data-model 字段一致。
