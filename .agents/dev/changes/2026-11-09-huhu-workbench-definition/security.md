# 安全与隐私

本文件定义信任边界、必须实现的控制和对应的验证。保证范围：防止其他网页、其他本机程序未经令牌访问 HUHU 能力；防止 Vault 内容在渲染时执行代码；防止秘密明文落盘或外泄到日志、导出、同步；防止 HUHU 自身重复执行外部副作用。不保证：抵御以同一用户身份运行的恶意程序（它可以直接读写 Vault 与进程内存）。

## 1. 信任边界与控制

| 边界 | 威胁 | 控制 | 验证 |
| --- | --- | --- | --- |
| Vault 内容 → Renderer | XSS、恶意链接、远程资源追踪 | rehype-sanitize 默认 schema（只增加 KaTeX 类名与 `data-wikilink`）；Mermaid `securityLevel: 'strict'`；链接只允许 http/https 经 `openExternal`；`img` 只允许 Vault 资源路由与 `data:` 图片；CSP `default-src 'self' huhu-app:; img-src 'self' huhu-app: data: http://127.0.0.1:*; connect-src http://127.0.0.1:* ws://127.0.0.1:*; script-src 'self'; object-src 'none'; frame-src 'self' http://127.0.0.1:*`（PDF 预览） | 恶意 Markdown 夹具（script、onerror、javascript:、svg 内脚本、远程图片）E2E |
| Renderer → Main | 任意 IPC、导航劫持 | `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`；Preload 只暴露 interfaces §6 的 `huhuHost`；校验 `senderFrame.url`；`will-navigate` 与 `setWindowOpenHandler` 一律拒绝并转 `openExternal`（仅 http/https，拒绝含用户名密码的 URL）；禁用 `webview` | 单元测试 IPC 校验；E2E 尝试 `window.open('file:///')` 被拒 |
| 本机其他进程/网页 → Engine | 未授权调用、DNS rebinding、CSRF | 只监听 127.0.0.1；所有路由 Bearer 令牌；Origin/Host 校验（R-03 ingress policy）；拒绝 `X-Forwarded-*`；请求体与并发上限 | 集成测试：无令牌 401、错误 Origin 403、Host 非 127.0.0.1 403 |
| 外部入口 → 能力 | 越权写入、伪造身份 | 身份只由令牌决定；Dispatcher 管线检查开放状态与权限；`exposable: false` 的能力（保险箱明文、解锁、插件管理、Agent/SSH 执行）永不对外 | 契约测试覆盖每个 `exposable: false` 能力从 MCP/CLI/HTTP 调用均失败 |
| 路径输入 → 文件系统 | 路径穿越、符号链接逃逸 | `packages/vault/src/paths.ts`：只接受 Vault 相对 POSIX 路径；拒绝绝对路径、`..` 段、NUL、Windows 保留名；写入前对目标父目录 `realpath` 并确认在 Vault 根内；不跟随指向 Vault 外的符号链接写入 | 单元测试路径表；临时目录中的 symlink 测试 |
| 数据包导入 | zip slip、膨胀 | data-model §9 的限制；先完整校验后解压到临时目录再移动 | 恶意 zip 夹具 |
| Engine → 子进程 | 命令注入 | 所有子进程 `spawn(program, argv[], { shell: false })`；Task 文本只写入 context 文件，不进入 argv 以外的命令行拼接；provider argv 由适配器生成（R-32） | 含 `$()`、反引号、换行、`;` 的任务与脚本参数测试 |
| 外部插件 | 越权调用 | 独立进程 + 插件令牌 + 权限表；不能获得 `execute`/`admin` 能力 | ACC-PL-03 |
| SSH | 中间人、凭据泄露 | 每跳主机密钥校验，变化即拒绝（D-13）；凭据仅在握手时从保险箱解密，不写日志 | ACC-SH-01–03、07 |
| Git 同步 | 秘密上传、覆盖远端 | 推送范围白名单（versioning §4），保险箱只含密文；推送前预览 | ACC-VS-06 |

## 2. 令牌

- Renderer 令牌：Engine 启动时 `crypto.randomBytes(32)`，经 Main 的 IPC 交给 Preload，只在内存。
- CLI 令牌：写在 `engine.json`（0600）。
- HTTP 服务令牌：创建时显示一次，`sha256` 存于 `gateways.json`，可撤销。
- 插件令牌：插件宿主启动时生成，进程退出即失效。
- 比较令牌使用 `crypto.timingSafeEqual`。

## 3. 日志与诊断

- pino `redact`：`*.password`、`*.secret`、`*.token`、`*.value`、`*.source`、`*.body`、`env`、`input`。
- 能力审计只记能力名、入口、结果码、耗时。
- 诊断包（`health.exportDiagnostics`）：应用与平台版本、插件状态、健康检查结果、事件日志、最近 1000 行 Engine 日志（已脱敏）；不含笔记/任务正文、保险箱任何内容、终端输出、SSH 主机地址（以主机 id 代替）、Vault 绝对路径（替换为 `<vault>`）。导出前显示包含的文件清单。

## 4. 保险箱

- 算法：scrypt（N=2^17, r=8, p=1）派生 KEK；随机 32 字节数据密钥 DK；AES-256-GCM 封装（12 字节随机 IV、16 字节 tag、AAD = magic + itemId），格式见 R-44。
- DK 只在 Engine 内存；锁定时用 `buffer.fill(0)` 清零后丢弃。
- 明文只经 `SecretUse.resolve` 交给 Engine 内的 ssh、automations（脚本环境变量）与 versioning（HTTPS 令牌），或经 `safe.items.reveal` 交给桌面界面；Renderer 不缓存明文（详情面板关闭即丢弃）。
- 剪贴板清除：30 秒后仅当剪贴板内容仍等于复制值时清空。
- 主密码丢失不可恢复；界面在设置时明确告知。

## 5. 外部 CLI 与 Agent 的边界

Agent CLI、脚本与 SSH Exec 以用户的系统权限运行。Space 目录只是启动目录，不是沙箱：Agent 可以读写其他目录、访问网络、修改 Vault 文件。HUHU 的权限控制只覆盖经过 HUHU 能力入口的操作。界面在新建 Space 对话框与 Agent CLI 设置中以一行文字说明这一点；指南文件同样说明。无界面运行默认使用 provider 的“编辑”权限级别（Claude `acceptEdits`），不使用“完全放开”的权限模式。

Agent 修改 Vault 文件后，HUHU 通过文件监听当作外部修改处理（knowledge §5），不会覆盖打开中文档的未保存内容。

## 6. 外部插件

外部插件宿主进程是普通 Node 进程，拥有用户的系统权限；HUHU 只限制它的 HUHU 能力调用。安装确认对话框必须显示：“扩展以你的系统权限运行，可以读取你电脑上的文件。只安装你信任的扩展。”打开含外部插件的 Vault 时，若 `plugins.json` 中登记的外部插件此前未在本机确认过（确认记录在 `.huhu/runtime/<machineId>/trusted-plugins.json`），先以停用状态加载并请求确认，防止通过同步的 Vault 自动执行代码。

## 7. 依赖与供应链

- `pnpm-lock.yaml` 固定全部版本；CI 使用 `--frozen-lockfile`。
- `pnpm audit --prod` 在 CI 运行，高危漏洞阻止发布（例外须写入 `docs/security-exceptions.md` 并注明到期日）。
- Herdr Core 二进制按 `herdr.lock.json` 校验 SHA-256（release §1）。
- 复制的上游源码保留版权头与来源记录（reuse §1）。
