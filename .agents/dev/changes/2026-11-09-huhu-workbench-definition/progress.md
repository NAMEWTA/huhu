# 进展

## 当前状态（2026-11-10）

实现已开始，进度见下表。未列出的任务均未开始。

| 任务 | 状态 | 证据 |
| --- | --- | --- |
| W01.1 monorepo 与工具链 | 完成（oxfmt/knip 仅占位配置） | lint/typecheck/test 通过；边界规则样例被拦截 |
| W01.2 Electron 骨架 | 完成（仅 Linux 本机验证） | Playwright 启动用例通过 |
| W01.3 CI / W01.4 打包 | 配置已写，**未在 CI 上运行** | 无 |
| W03.1 contracts（含 kinds、task DTO） | 完成 | 单元测试；审计通过 |
| W03.2 Cordis 与插件管理器 | 完成，已接入 Engine | 启停/回滚/依赖/并发/事件订阅释放测试 |
| W03.3 Dispatcher | 完成 | 契约测试；两轮审计问题已修 |
| W03.4 HTTP/WS 服务 | 完成（服务端）；Renderer 客户端未做 | 401/403/413/429、补发/resync 测试 |
| W03.5 Engine 进程 | 子进程启动/关闭/端点描述完成；Main 监管、崩溃重启、utilityProcess 未做 | 子进程测试 |
| W03.6 CLI | call、vault info、自动启动无界面 Engine 完成；便捷命令、mcp 未做 | 集成测试 |
| W04.1 Vault 生命周期 | 路径守卫、vault.json、写者锁、只读完成；启动页、切换窗口未做 | 单元/集成测试 |
| W04.2 原子写与操作日志 | 完成（含崩溃注入） | 子进程崩溃恢复测试 |
| W04.3 语义 Markdown | frontmatter 局部改写、kind 模式、仓储完成 | 单元测试 |
| W04.4 文件监听 | 完成（原生 + 轮询回退） | 集成测试（仅 Linux） |
| W04.5 索引与 vault.* 能力 | 完成（中文二元分词）；性能指标未测 | 单元/集成测试 |
| W04.6 数据包导出导入 | 库完成；未接能力 | 恶意包测试 |
| W02.1/W02.2/W02.3 设计系统与外壳 | 六主题 token（对比度测试）、Button/CompletionCircle/Badge/Banner/EmptyState、AppShell（rail/标签/状态栏/贡献注册表）完成；未用 Tailwind/shadcn（手写 CSS），无 DataTable/DateTimePicker/Sheet/详情面板/命令面板 | 单元测试 + Playwright |
| W03.5 桌面端 | Main 监管 Engine utilityProcess、崩溃提示与重启、窗口关闭有序停止完成；启动页（W04.1）以环境变量/默认目录过渡 | Playwright（杀进程→重启） |
| W05.2–W05.4 笔记后端 | 创建/模板/改名/移动改写双链/复制/回收站/日记/星标/保存完成 | 单元 + HTTP 集成 |
| W06 编辑器（部分） | CodeMirror 源码模式、消毒预览（双链、GFM）、自动保存与冲突提示；无实时预览/分屏/合并/多文件类型 | 组件测试 + Playwright |
| W09 档案 | 后端完成（类型/字段校验/关系双写/迁移/删除清理/未定义字段）+ 基础界面；无表格/卡片视图切换、导出、关联任务 | 单元 + HTTP + Playwright |
| W10 收件箱 | 后端完成（来源由身份决定、转换幂等、撤销、回收站）+ 基础界面；无 Mod+Shift+N 全局快捷键、批量归档 | 单元 + HTTP + Playwright |
| W11 保险箱 | 后端（scrypt+AES-GCM、冷却、自动锁定、AAD 防互换、审计、SecretUse）+ 基础界面完成；无「修改主密码」界面、锁屏/休眠监听（Main powerMonitor）、剪贴板 30 秒清除（copyText） | 单元 + HTTP + Playwright |
| W12 Agent CLI（部分） | Space、Provider 检测、会话启动/中断/结束/重命名、Herdr Core 实例隔离、终端 attach（WS 桥 + xterm，真实 Core 验证输入/resize/退出码/重开）、基础模块界面；历史扫描（claude/codex 原生会话文件只读扫描，按 Space 归属）与恢复会话（`agent.history.list/resume`，仅接受扫描结果中的 id，在原 cwd 启动）及历史面板完成，其他 provider（gemini/pi 等）、置顶、只读记录查看未做；变更审查（`agent.review.*`：git diff HEAD 含未跟踪，行内意见，预览确认后经 terminal.send 写回会话，ACC-AG-10 用真实 Core 验证；路径写入终端前清洗，shell 会话有警告）已完成；会话退出状态与对账（exited + 退出码；按地址和 huhu.session 标签核对；Core 没运行时标记已结束；列表 5 秒自动刷新）已完成；分屏（左右两格 / 2×2，每格选会话，新建会话和点标签自动出现，选“空”后不跳格，切 Space 重置，布局偏好存本地，键盘可切换；真实 Core e2e）已完成，未做可拖动分隔条；仅「Core 中有而记录中无」的补记录未做、Space 管理界面、设置对话框；恢复命令未在真实 claude/codex CLI 上验证 | 单元 + 真实 Core 集成 + Playwright |
| W13 自动化（部分） | 规则能力、Croner 调度与补跑、预览、立即运行、进程 worker、激活记录、claim；agent_prompt 与 script 动作（argv 不经 shell、保险箱引用环境变量、进程树终止、输出末 200 行、automation-run 记录）、预配置脚本管理能力、模块界面（规则/预览/立即运行/激活记录/新建通知规则）；规则编辑器（新建/编辑：通知 / Agent / 脚本，预设+时刻或 cron，即时校验与接下来三次，改时间不会立刻补跑）已完成；监督进程（detached 监督脚本托管 CLI，输出按轮次落盘，心跳；引擎关闭只停止等待；启动对账接管：结果已落盘→完成、仍在跑→后台等待、从未启动→重新启动、否则 unknown；孤儿 CLI 可取消）、问答续跑（`automations.runs.answer`，全部答完才 `--resume`，同一 task-run 追加“第 n 轮结果”，提问 id 冲突自动改名）、运行取消/标记失败并重试（上限 10 次）、运行页与详情（状态/时间/cwd/CLI/会话 id/结果/提问与回答）已完成，提示词走 stdin；claude stream-json 与 codex --json 的解析与 `--resume` 参数只对照 `--help` 与假 CLI 验证，未用真实账号；Windows 的监督进程（Job breakaway、.cmd 包装）未验证；未做：“在 Agent CLI 中打开此会话”、agent_prompt 的问答（automation-run 无提问）、R-38 会话文件扫描对账 | 单元 + 假 CLI 端到端 + Playwright |
| W15 版本历史（部分） | shadow 仓库文件历史、命名版本、恢复（含恢复前检查点；规则恢复后暂停；任务恢复保持完成状态并通知自动化暂停）、Git 页后端（init/status/stage/unstage/commit/log/diff）、模块界面（文件历史 + Git 页）；同步后端（纳入范围分类含用户排除规则、预览、临时 index 提交、拉取合并、推送、冲突回退并报告文件；用本地 bare 仓库验证 ACC-VS-05/06）；同步页（远端/模式/预览/拉取/推送/同步/状态）与冲突解决（`conflicts.*`：merge-tree 预判、会话只存 OID、逐块选择、应用前重验、临时 index 生成合并提交；整文件冲突/二进制/删除对修改只能整体选择；单测 + 真实 git + Playwright 通过）完成；自动同步调度（`auto-sync.ts`：follow 仅拉取、full 拉取+推送独立定时器，间隔 30–3600 秒，冲突/认证失败暂停，离线指数退避，远端地址拒绝内嵌凭据；用注入时钟单测）已完成；凭据（保险箱 token）经一次性 GIT_ASKPASS 接入 https 远端（令牌只经子进程环境变量；清空系统 credential helper；askpass 只回答配置主机；锁定/引用失效按认证失败暂停，`safe.unlocked` 事件触发自动恢复）。**Windows 的 askpass（cmd→PowerShell）未实机验证**；https 重定向到 http、`safe.unlocked` 订阅接线无自动化测试、文件差异视图、语义文件 kind 的完整校验（目前只校验 frontmatter 可解析）；full 模式的同步提交会包含用户手动暂存的纳入范围文件（既有语义）；merge-tree 需要 git ≥ 2.38，更旧时回退到旧的合并后回退路径（未实测） | 单元 + 真实 git + HTTP + Playwright |
| W17 网关（部分） | `huhu mcp`（stdio，身份 mcp）、MCP over HTTP（`POST /mcp` 无状态，默认关闭，仅 mcp/http 令牌，经 Dispatcher 授权）、stdio 与 HTTP 共用 `createMcpServer`、`capabilities.list`、`plugins.list/setEnabled`、CLI 便捷命令、HTTP 服务令牌（哈希存储/撤销断开连接）、`gateway.get/update/mcp.update`；网关界面（能力开放开关、不可开放的能力无开关、令牌创建/撤销、MCP 开关）；测试台（`gateway.check`：不执行，只报告 CLI/MCP/HTTP 身份现在是否允许及原因）；无真实调用的测试台、指南维护、MCP 提示词与资源模板 | 集成 |
| W14 SSH（部分） | 主机配置（跳板循环检测）、known_hosts 逐跳信任、多跳连接、Exec、审计、凭据只经 SecretUse、交互 Shell（detach 不关 channel、回放、断开后不复活，经 /ws/terminal/ssh-<id>）、模块界面（新增主机进保险箱、指纹对话框、Exec、终端）；用 ssh2 假服务器验证，未对真实 OpenSSH 验证。SFTP（`ssh.sftp.*`：浏览、文本预览 <2 MiB、上传/下载流式 ≤512 MiB、临时文件+rename、覆盖需确认且旧文件先备份再替换、mkdir/rename/delete、取消/超时/断线都释放互斥、同主机一次一个传输；用内存 SFTP 假服务器验证，**未对真实 OpenSSH 验证**）已完成；无主机编辑/跳板选择界面、Agent 转发 | 单元 + HTTP + Playwright |
| W16 插件中心（部分） | 内置插件启停（含依赖级联确认）、偏好持久化到 plugins.json、rail/标签按启用状态即时过滤、清单（huhu-plugin.json）成为 Engine 注册的唯一来源、停用后能力返回 PLUGIN_DISABLED；无外部插件安装/宿主进程、权限页 | 单元 + HTTP + Playwright |
| W18（部分；设置新增：数据与存储（重建索引可取消、导出/导入数据包，ACC-SY-08 引擎测试；首次建立索引不可取消；导出为流式，200 MB 级停顿 ~150 ms）、当前 Vault（改名/描述写 vault.json，路径、ID、概况）、快捷键（只列已实现的）、关于（版本、开源声明，打包态已验证）） | 站内通知、设置（外观含导航宽度/紧凑/动效；编辑器页含自动保存/行号/字号/行高/宽度/拼写，均由笔记编辑器读取生效；日期与时间页的时区驱动日记与任务的“今天”，ACC-SY-06 有引擎测试；周起始日尚无消费方故未提供控件）、首页（概览卡片+最近笔记；专注计时（引擎结算、到点通知、ACC-WB-06 有 e2e）、习惯（当日勾选、按设置时区跨日重置）、卡片显示/隐藏自定义；插件停用时对应卡片隐藏（ACC-WB-08 有 e2e）；未做卡片排序、插件贡献卡片、连续天数/归档、最近活动；关闭窗口时计时不暂停而是继续按起始时间计）、健康中心（插件/文件问题/索引/监听/保险箱检查）；诊断导出、设置的数据与存储页的文件结构浏览与存储规则表 | 单元 + Playwright |
| W08.1 任务后端 | 分类、勾选、输入版本、CRUD、回收站、提醒完成；UI 与 TaskQuery 服务未做 | 单元/HTTP 集成测试 |

未开始：W01.5 testkit、W02 设计系统与外壳、W05–W07 知识库与编辑器、W08 UI、W09–W20 其余全部。**0.0.1 发布条件远未满足**：没有可用的界面功能，三平台 CI 与安装包未验证。

## 定义依据

- 原型 v9 已在真实 Chromium 中逐模块打开核对（14 个模块），并按源码确认路由实际使用的组件（未路由的旧组件不作为产品意图）。
- 参考源码按 [reuse](reuse.md) 中列出的路径逐一确认存在；Herdr Core 的平台支持与协议、Open Knowledge 的进程结构、Orca 的 SSH 与 Agent 目录、agent-autoloop 的 worker 适配器、DSH 的 Cordis API 均按源码核对。
- 未执行任何安装、构建或运行参考项目的操作；所有性能目标与平台行为都是待测目标，不是已测结果。

## 下一步

从 [W01 工程基线](tasks/W01-foundation.md) 开始；W01.4（三平台安装包冒烟）与 W12.1（Herdr 三平台集成）是最早需要验证的外部事实。

## 打包冒烟（Linux，2026-11-10）

`electron-builder --linux dir` 在本机成功产出 `release/linux-unpacked`；用 `xvfb-run` 启动解包产物，应用运行 12 秒并在 Vault 目录创建了 `.huhu/vault.json`（说明打包后的 Engine utilityProcess 正常启动）。AppImage/deb、Windows、macOS 安装包与校验和脚本在 CI 中尚未运行。

## Herdr Core 验证（Linux，2026-11-11）

- `herdr-core` 无官方发布包（GitHub releases 为空），必须自行编译：需要 Zig 0.16 **和** 已检出的 `vendor/ghostty` 子模块（参考源码副本里该目录为空，需 `git fetch` 固定提交 `1e5cdb8…`）。Linux x64 release 构建约 3 分钟，产物 `herdr-core`（7.7 MB，同时是 `hc` CLI；服务用 `herdr-core server start`）。
- `packages/herdr-client` 已用真实 Core 验证：`server.status`、`terminal.run`（labels、cwd）、`terminal.list` 按 `huhu.launch` 标签查回均可用（plain 模式）。framed attach、事件订阅尚未对真实 Core 验证。
- Windows / macOS 构建与 `herdr.lock.json`、`fetch-herdr` 脚本未做：发布前需要在 CI 中编译并托管三个目标的二进制，这是 W12.1 / W20 的硬前置。

## 工程质量与发布缺口（2026-11-11）

- `pnpm knip` 已清零并进入 CI（Linux 一次）；删除了 55 个未使用依赖条目、`SKIP_LABEL` 与探针脚本。`pnpm format` / `format:check` 已有脚本，但仓库约 450 个文件未格式化，**格式检查尚未进 CI**（需先做一次全量格式化并决定 `.agents/.claude/vendor` 的忽略范围）。
- CLI 随包分发：`apps/cli` 用 esbuild 打成单文件 `cli.mjs`（`@parcel/watcher` 换桩），经 `resources/bin/huhu(.cmd)` 以 `ELECTRON_RUN_AS_NODE` 运行，无运行 Engine 时自动拉起 `app.asar` 里的 `engine.js`；Linux 解包目录已验证（`scripts/smoke-cli.sh`：版本一致、自动拉起 Engine、符号链接调用）。**macOS/Windows 的启动脚本与 AppImage 解包后的冒烟未验证**；网关页「命令行」可安装/卸载（Linux/macOS 符号链接，原子替换，仅替换本应用/悬空/旧版 HUHU 的链接；AppImage 不支持并说明；Windows 直接写注册表用户 PATH 保留 REG_EXPAND_SZ——**Windows 与 macOS 均未实机验证**，Linux 打包版已验证安装→--version→卸载）；命令行交互测试台未做。
- Herdr Core 随包：已改用官方发布包（`scripts/herdr.lock.json` 锁定 0.1.19 与五个目标的 SHA-256；`scripts/fetch-herdr.mjs` 下载、校验、解压到 `apps/desktop/resources/herdr/<平台>-<架构>/`；`beforePack` 缺失即打包失败；CI/release 都先 fetch）。Linux 本机已验证：真实 Herdr 用例与 e2e 全跑、打包产物含 `herdr-core` 且 Engine 启动。**Windows/macOS 的解压（Windows 用 tar 解 zip）、打包与运行、`HUHU_HERDR_BIN` 在三平台 CI 上均未验证**；官方最新为 0.1.20，尚未评估升级。
- 打包：`electron-builder --linux dir` 需关闭原生模块重编译才通过（`cpu-features` 在 Node 26 下编译失败，经 ssh2 引入）；无打包后的 E2E 子集；`release.yml` 从未在 GitHub 上运行。
