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

> 上表为 2026-11-10 的后端基线；各模块界面已于 2026-11-11 按原型 v9 重写，见下文「界面复刻进展」。**0.0.1 发布条件仍未满足**：三平台 CI 与安装包未验证，外部插件、批注/评论等见下文缺口。

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

## 当前状态（2026-11-12）

上方表格是 2026-11-10 的后端基线，其中「UI 未做 / 未开始」类描述已过时。2026-11-11～12 完成：

- **界面复刻**：外壳、首页、任务、知识库（Atomic Editor 引入）、收件箱、档案、保险箱、自动化、版本历史、远程连接、Agent CLI、健康中心、设置、能力网关、插件中心均按原型 v9 重写；原型 CSS 原样放入 `packages/ui/src/styles/proto/`（按原型导入顺序，字体内联），`components.css` 只补原型缺失的类。
- **新增能力与模块**：
  - 批注（`comments.*`、R-24 锚点复制、保存后 refind、改名/恢复/永久删除联动、详情面板与正文装饰）。
  - 外部扩展（清单校验、权限确认、独立宿主进程、`plugin:<id>` 令牌、命令、卸载保留数据、崩溃隔离、本机信任绑定内容哈希）及三个示例扩展。
  - Agent 指南维护（三份文件生成、状态判定、自动维护、备份恢复、设置·Agent 接入页、`huhu --skill`、`huhu guide status`）。
  - 启动页与切换 Vault（Main 串行管理 Engine、示例 Vault、导入数据包、只读打开、本次运行最近列表）。
  - MCP 资源 / 模板 / 提示词与网关 Tools / Resources / Templates / Prompts 子标签；测试台真实调用与调用记录。
  - 快速捕获（`Mod+Shift+N`）、保险箱复制秘密值 30 秒清除与锁屏/休眠锁定、笔记文件夹重命名/移动/删除、回收站带走/恢复稳定 id、三方合并与草稿保留（ACC-KN-04/05）、非 Markdown 文件元信息卡片（ACC-KN-10）、版本同步脚本 / build-info / 按标签触发的 release 工作流。
- **测试**：单元/集成 591 项通过；Playwright 新增 axe 无障碍、状态巡检、写作恢复工作流、打包后子集（`pnpm e2e:packaged`）；规模 Vault 基准（`pnpm bench`）。
- **性能实测（Linux 开发机 + xvfb，2026-11-12/13，commit 07816a1，3 轮 + 全量取值）**：冷启动到首页可交互 1.2～2.8 s（≤ 3 s；首轮含 Electron 首次安装时曾到 3.3 s）；插件停用 / 启用 15～35 ms / 26～37 ms（≤ 300 ms）；Engine 常驻内存 217～218 MiB（2,000 篇笔记，≤ 600 MiB）；打开 1 MiB（按段落组织）文档到可编辑 157～206 ms（≤ 500 ms）；编辑输入延迟（5,000 段落文档，keydown→编辑区 DOM 更新）p95 12.2～13.6 ms（≤ 16 ms；优化前 28.5～33.9 ms，根因是实时预览每次按键整篇遍历语法树，现对 > 120K 字符的文档只装饰视口 ± 30K 字符）；1,000 行任务列表滚动最大帧间隔 21～25 ms、无 > 66 ms 的卡顿；终端 10 MiB 输出期间界面输入响应 p95 24～39 ms（≤ 100 ms）；5,000 篇笔记全量索引 1.2～11 s（≤ 15 s），全文检索均值约 30 ms、p99 约 44 ms（p95 ≤ 150 ms）。**尚未测量**：8 小时 soak。口径说明：Xvfb 无真实 vsync，输入延迟不含合成器绘制。
- **审计**：共 7 轮独立审计，阻塞项均已修复；每轮的结论与修复见 git 历史。

### 验收补测（第 8 轮）

此前没有自动化证据的 14 条验收项已补测并通过：ACC-AG-02/07（给已有用例打标签）、ACC-AG-05、ACC-AG-11、ACC-KN-09、ACC-PL-01、ACC-PL-06、ACC-SY-03、ACC-TK-02/03/06/11、ACC-WB-03/05。位置：`tests/e2e/workflows/acceptance.spec.ts`、`plugins/tasks/test/service.test.ts`、`apps/engine/test/engine.test.ts`、`apps/cli/test/cli.test.ts`。补测时发现并修复的两处与规格的偏差：

- MCP：已缓存旧工具表的客户端在插件停用后调用 `tasks.list`，得到的是含糊的“能力不存在”，规格要求 `PLUGIN_DISABLED`（现在调用交给 Dispatcher 判定）。stdio 形态（`huhu mcp`）同样处理：`capabilities.list` 新增 `includeInactive`，CLI 据此识别已停用插件的能力名（CLI 测试覆盖）。
- 工作台：标题栏的 Vault 名称原先不可点；现在是“切换 Vault”按钮，有未保存文档时弹出“全部保存并切换 / 保留草稿并切换 / 取消”（原型 `vault-title-button`；规格“切换与关闭 Vault”第 1 条）。

笔记页的“文件目录”条（`knowledge-resource-bar`）在原型里只在窗口宽度 ≤ 900px 时显示，桌面宽度下是 `display:none`，不属于缺口。

### 原型“保留”功能补齐（第 8 轮）

此前列为缺口的功能核对后：档案表格 / 卡片切换与导出、首页“今日安排 / 最近活动”分区、版本历史的并排 / 统一与忽略空白早已实现；新补的有：Agent CLI 历史固定（`agent.history.pin`、`agent-cli/pins.json`、固定项置顶，e2e 覆盖）、SSH 主机编辑与按顺序选择跳板（ACC-SH-04 循环检测的错误显示在对话框内）、首页卡片在同列内排序（`widgets.json` 的 `order`，自定义面板上移 / 下移）、版本历史“与当前内容 / 与前一版”对比基准分段。笔记拖放（原型 `application/x-huhu-file`）：笔记可拖到文件夹或空白处移动（e2e 覆盖）；从系统拖入 .md / .txt 落在文件树空白处等同“导入”（未做 e2e：Playwright 无法可靠模拟系统文件拖入）。文件夹也可以拖放移动（引擎的 `notes.move` 本来就支持文件夹；拖进自己的后代会被引擎拒绝；e2e 覆盖）。

### 规模 Vault 性能（第 8 轮）

`tests/perf/scale-vault.ts` 生成 10,000 篇笔记（约 100 MiB）/ 1,000 任务 / 1,000 档案（`pnpm exec tsx tests/perf/scale-vault.ts <目录>` 或在测试里调用 `createScaleVault`）；`tests/e2e/perf.spec.ts` 的 scale-vault 用例在 Linux（Xvfb）上多次测得：

- 打开到文件树可用 3.6–4.8 s（目标 ≤ 6 s）：达标。
- 全量索引完成（自启动起）12–15 s（目标 ≤ 15 s）：贴线，个别次 15.2 s。
- **Engine 常驻内存 385 MiB（目标 ≤ 600 MiB）：达标。** 先前用 Orama 的 JS 对象索引实测 590–720 MiB（压缩文档仓、建完整理堆等小修都不能稳定压到 600 以下，已回退），于是把全文索引换成 Node 内置的 `node:sqlite` + FTS5 内存库（不新增依赖，并移除了 `@orama/orama`）：分词仍是原来的 `tokenize`（中文二元切分），FTS5 只做按空格切分与前缀匹配；结果集合与旧实现一致（一次性的差分脚本——随机增删改 + 前缀 / 多词 AND / kind 过滤，1,437 次对比 0 处结果集合不同，脚本未入库；排名分数是 SQLite 的 bm25，首位结果与旧实现约 15% 不同），建索引更快（10,000 篇 ≈ 11 s 对 17 s）。Electron 44（Node 24）自带 `node:sqlite` 与 FTS5，已在打包版里验证。

### ACC-WB-02：只读浏览无写权限的目录（第 8 轮完成）

打开无写权限的目录先给出“无法写入此目录”并提供“以只读方式打开”；只读打开后可浏览，写操作返回 `READ_ONLY_VAULT`，磁盘上没有 `.huhu`、没有任何新文件（engine 测试 + e2e 覆盖）。实现：`Vault.stateDir`（运行状态目录）——通常是 `<vault>/.huhu`，只读且磁盘不可写时指向系统临时目录（`huhu-readonly-<路径哈希>/.huhu`）；没有 `.huhu/vault.json` 的普通文件夹只读打开时 Vault 身份由路径派生、不落盘。Engine 启动、内核（外部扩展）与 notes / archives / agent-cli / automations / safe / ssh 插件的状态路径都改为 `vault.stateDir`（`api.vault.stateDir`）。`versioning` 的 `history` / `sync` 仍直接拼 `<root>/.huhu`：它们只在用户动作（保存版本、同步）时才写，只读 Vault 里这些动作本来就被拒绝。

### 切换笔记保留撤销历史与滚动位置（第 8 轮）

外层仍按笔记路径重建编辑器组件，但编辑器卸载时把每篇文档的快照（撤销历史、选区、滚动位置；`EditorState.toJSON` + `historyField`）留在模块级缓存里（最多 32 篇），同一篇再次挂载且文本与快照时完全一致才恢复（外部改过就从头开始）。e2e 覆盖（不加这段实现时该用例会失败）。

### 已知限制

- **超长单段落的大文档**：@lezer/markdown 对单个超长段落里的大量 `[...]` 行内解析是超线性的（单段 1 MiB ≈ 0.8 s，4 MiB ≈ 10 s；按段落组织的 1 MiB 文档约 0.2 s）。大于 256K 字符的文档默认以源码模式打开，但解析成本在两种模式下相同。根治需要改上游解析器或对超长段落降级，未做。
- 全文索引已换成 SQLite FTS5（D-34）：打分是 bm25，与旧实现的排名在首位结果上约 15% 不同；检索结果集合一致。

### 仍有缺口（0.0.1 之前需要处理或明确不做）

- 三平台：只在 Linux 上验证；Windows / macOS 的 Herdr、CLI 安装脚本、打包、冒烟、`ci.yml` / `release.yml` 从未在 GitHub 上运行；三台实机手动验证未做。
- W19：状态巡检已覆盖水平滚动（1024×768 / 960×600 / 1.5× 缩放 / 只读 Vault）、Engine 断开、插件停用；缺逐模块空态断言。工作流 W-A（委派给 Agent）有界面级旅程测试（收件箱捕获与建任务走能力入口，自动化“立即运行”→ 任务详情的运行结果 → 勾选完成走真实界面，假 Codex）；W-C（远程运维脚本）也有界面旅程测试：保险箱设置、SSH 新增主机（密码进保险箱，主机配置只有引用）→ 连接 → Exec、自动化脚本用保险箱 Token 环境变量“立即运行”→ 运行页看到输出，并断言整个 Vault 目录里找不到 Token 与 SSH 密码明文（Token 与脚本规则经能力接口准备）
- 视觉：Agent CLI 评审面板（原型 `agent-review*` 无 CSS）、自动化运行记录面板、笔记默认行号与工具栏换行与原型存在差异；沙箱曾阻止截图，逐页像素对照未完成。
- 宣布完成前仍需最终 audit 与顾问复核。

## 近期补充（Space 编辑/删除、历史记录只读查看、笔记关联）与审计结论

- 新增：笔记详情“关联”分区（关联任务/档案，只在该分区打开时才查询）、笔记菜单“保存版本”、Agent CLI Space 编辑/删除（删除前要求无运行中会话，并清理固定记录；默认 Space 只创建一次，删除后不再重建）、`agent.history.read` 只读查看历史会话（只读扫描结果中的文件，不接受调用方路径）。接口命名差异见 interfaces.md §9。
- 审计（隔离 worktree，快照 eb5861d）：install / typecheck / lint / knip / 单元测试（602 通过）/ build 全部通过；e2e 85 通过、3 失败、9 跳过。
  - `ACC-WB-09 只读 Vault`：单独重跑通过，全量运行偶发超时（不稳定，待观察）。
  - `Agent CLI 启动设置面板`：审计环境没有可用的 herdr-core（CI 由 `scripts/fetch-herdr.mjs` 提供）；本机有 herdr-core 时单独运行通过。
  - `编辑输入延迟 p95 ≤ 16 ms`：本机共享、负载高（load 3–5）时测得 16.4–17.6 ms；分阶段中位数 CM 事务约 12 ms，与近期改动无关（检查器在该用例中不挂载）。该指标只在本机严格断言，CI 上放宽。需在空闲机器上复测。
- 审计提出并已处理：默认 Space 被重建、`gitInstalled` 永久缓存“未安装”、删除 Space 不检查运行中会话与固定记录残留、检查器计数闪烁与硬编码文案、transcript 的 `<` 过滤过宽与短读。

## 再次补齐的缺口（数据页 / 外壳 / 组件 / 插件贡献 / MCP）

- 设置 → 数据与存储：按原型分四个分区——文件结构（`vault.managedFiles` 按领域筛选 + 路径搜索，只读预览复用 `vault.readFile`，复制内容、在文件管理器中显示）、索引与恢复、导出与迁移（含“关闭前提示导出数据包”开关）、存储规则表（data-model §1）。切换 Vault 对话框在该开关开启时先要求导出并勾选“我已确认备份文件可用”。仍未做：数据页里的“未完成操作列表”（健康中心有同样内容）、清除索引按钮。
- 外壳：顶栏 Vault 下拉菜单（最近打开 / 打开其他 Vault… / 关闭 Vault；不做“在新窗口打开”，见 D-36）；F6 / Shift+F6 在功能栏、模块侧栏、内容、详情之间循环焦点（`data-region`）。
- 组件：`Combobox`（任务“项目”、版本历史“当前文件”）、`DataTable`（TanStack Table + react-virtual；网关调用记录、健康事件日志、保险箱访问记录、SSH 审计）。其余 `<table>`（插件中心、快捷键、MCP 能力表等）仍是手写表格，行数很少。
- 首页卡片可由插件贡献（`contributions.homeWidgets`，SSH 主机与版本与同步两张卡片，见 D-37）；内置卡片仍由首页渲染。
- stdio MCP 发 `notifications/tools/list_changed`（D-38）。
- 验证：全量 e2e 97 通过 / 2 失败（均为本次改动导致的预期变化：快捷键表多了 F6、顶栏 Vault 按钮变成下拉菜单，已修正用例并单独重跑通过）/ 3 跳过；单元测试 609 通过。

## 顾问复核后补齐

- ACC-KN-02：模式切换遇到输入法组合时等 `compositionend` 再切（`MarkdownEditor`），新增 CDP `Input.imeSetComposition` 的 e2e。
- 未完成操作：`vault.pendingOperations`；数据页“索引与恢复”列出，关闭 / 切换 Vault 前有未完成操作时即使没开提示也要先导出并确认备份。
- 专注计时：退出前暂停并保存剩余时间（D-42），e2e 覆盖。
- 删除空包 `packages/testkit` 与 `plugins/health`（D-40）；D-41 / D-43 记录不做的部分。
- 仍待用户 / 真机：release §5（push 后三平台 CI 与 release.yml）、8 小时 soak、KN-03 / SF-07 / AG-06 真机手动记录、VS-05 / 08 真实远端；性能 p95 需在空闲机器上正式测量一次并记录。

## 性能复测记录（本机，Linux，8 核，负载均值 3.6–4.3，非空闲）

- 编辑输入延迟 p95（实时预览，5,000 行）：3 次单独运行分别为 16.4 / 13.0 / 15.6 ms（目标 ≤ 16 ms），最大 22–42 ms；全量运行在高负载下曾测到 43.9 ms。结论：在目标线附近，受机器负载影响明显；发布前仍需在空闲机器上正式测量一次（quality §3）。
- 其余指标沿用此前记录：冷启动到首页可交互 1.6 s、1 MiB 文档到可编辑 200 ms、插件停用/启用 17/37 ms、Engine 内存 162 MiB（2,000 篇）/ 385–399 MiB（10,000 篇）。
