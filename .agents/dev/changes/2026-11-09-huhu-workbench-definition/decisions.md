# 关键决定

每条决定只在此处维护理由；其他文件引用编号。“否决”列只说明为什么不用，不构成可选实施路线。

| ID | 决定 | 理由与证据 | 否决的做法 |
| --- | --- | --- | --- |
| D-01 | 桌面框架 Electron 44（基线 44.9.1），构建链 electron-vite 6 + Vite 8，打包 electron-builder 26 | Open Knowledge 桌面包 `packages/desktop/package.json` 与 Orca `package.json` 均以此链生产发布 NSIS/DMG/AppImage；可直接复用其配置 | Electron Forge（无参考实现，需自行验证三平台）；Tauri（Node 生态源码无法直接复用） |
| D-02 | Engine 运行在 Electron `utilityProcess`，每个打开的 Vault 一个；同一入口支持无界面 `huhu engine` | 复制 OK `desktop/src/main/index.ts` 的 `utilityProcess.fork` 与 `desktop/src/utility/server-entry.ts`；文件、进程、网络在 Engine，渲染进程不持有 Node 能力 | Main 进程直接做业务（阻塞 UI、难以无界面复用） |
| D-03 | Renderer、CLI、MCP、外部插件都经 Engine 回环 HTTP/WebSocket 访问能力；Main↔Renderer IPC 只做系统对话框、窗口与外部链接 | OK 用一个 `http.Server` 挂载 API/MCP/WS（`server/src/mcp-mount.ts`、`http/http-app.ts`），并有 `ingress-policy.ts` 管控来源；一条路径即可覆盖四入口 | 为桌面单独维护一套 IPC 业务接口（重复实现、易与 CLI 语义漂移） |
| D-04 | 唯一 Capability Dispatcher：所有业务调用以能力名 + zod 输入进入同一管线（鉴权→插件启用检查→校验→幂等→执行→审计） | 原型 `capability-contracts.js` 已定义能力目录；OK `http/local-api-dispatch.ts` 证明本地与 HTTP 共用分发可行 | 各入口各自调用服务函数 |
| D-05 | 插件运行时采用 Cordis 4.1.0（复制 DSH `vendor/cordis`、`vendor/cosmokit`，MIT） | 提供 Context/Service/插件作用域与自动释放，正好覆盖启停、贡献撤销和资源清理 | 自研 DI/生命周期容器 |
| D-06 | 12 个内置插件（notes、tasks、archives、inbox、agent-cli、agent-guide、ssh、automations、mcp、safe、versioning、health）与 Engine 同进程；外部插件运行在独立 `utilityProcess`，只能用受其授权约束的能力客户端访问 HUHU | 与原型 `catalog.jsx` 的 `BUILTIN_PLUGIN_IDS` 一致；外部插件不进 Engine 进程，权限检查在 Dispatcher 生效 | 外部插件直接加载进 Engine（可绕过所有策略） |
| D-07 | 用户内容唯一事实来源是 Vault 中的 Markdown；`.huhu/` 存 JSON 配置与运行材料；不使用 SQLite | 原型 `semantic-markdown.js`、示例 Vault 已采用；去掉 SQLite 可消除三平台原生 ABI 重建风险；查询投影在内存中构建，全文检索用 Orama（OK `core` 依赖 `@orama/orama`） | better-sqlite3 投影（原生模块、三平台 ABI 风险，且仅是缓存） |
| D-08 | 编辑器为 CodeMirror 6 单一实现：实时预览 = CM6 + Atomic Editor inline-preview 扩展（原型已固定 b6ed65f），源码 = CM6，双栏 = CM6 + 安全渲染预览，阅读 = 安全渲染 | 原型 `editor.jsx` 已这样实现，且用户最新要求“实时预览与源码都有 CM 行号、双侧留白、不破坏 IME/undo”；源码即唯一事实，未编辑字节不可能被改写 | Tiptap/ProseMirror + Yjs + Hocuspocus 混合编辑（与行号要求冲突，并引入 PM↔Markdown 往返失真与额外同步服务） |
| D-09 | 阅读渲染复用 Orca `components/sidebar/CommentMarkdown.tsx` 管线（react-markdown + remark-gfm/math + rehype-sanitize + KaTeX + Mermaid 围栏） | 已在 Orca 生产使用，包含消毒与 Mermaid | marked + DOMPurify 自行拼装（原型临时方案） |
| D-10 | 终端与 Agent 交互会话由 Herdr Core（`hc` 0.1.19，Apache-2.0）拥有；HUHU 每台机器每个 Vault 启动一个私有 Core 实例 | Core 支持 Windows x64、macOS arm64、Linux x64；关闭 viewer 不结束程序；JSON-RPC + framed attach 协议有 OpenRPC 描述（`schema/hc.openrpc.json`） | node-pty 自建会话守护（需要自研持久化与重连） |
| D-11 | 自动化触发的 Agent 运行使用 agent-autoloop 的无界面 worker：provider CLI 打印模式、stream-json 输出写文件、监督进程保留退出码 | AA `worker/run.ts`、`plugins/claude/agent.ts`、`plugins/codex/agent.ts`、`worker/contract.ts` 已实现 argv、结果/会话 ID 解析与回执；Herdr `terminal.read` 返回的是折行屏幕文本，不适合解析结构化结果 | 在 Herdr 交互终端里发送提示并抓屏解析 |
| D-12 | Agent 会话历史按 machine + canonical cwd 从 provider 原生会话文件扫描，复用 Orca `main/ai-vault` 扫描器 | Orca `session-scanner.ts`、`session-scope-cwd.ts` 已覆盖 Claude/Codex 等格式与 cwd 归属 | 只显示 HUHU 自己启动过的会话 |
| D-13 | SSH 使用 ssh2 1.17，主机密钥校验、known_hosts、SFTP、远程 Exec 复制 Orca `main/ssh/*`；HUHU 配置的跳板链用 ssh2 `forwardOut` 逐跳建立并逐跳校验主机密钥 | Orca 已在生产验证 ssh2 认证与主机密钥决策；`forwardOut` 是 ssh2 公开 API，可让每一跳都使用 Vault 内凭据 | 调用系统 `ssh -J`（无法逐跳展示信任决策，也无法使用保险箱凭据） |
| D-14 | 保险箱：主密码经 Node `scrypt` 派生密钥加密随机数据密钥；每条秘密用 AES-256-GCM 封装，格式复制 Orca `orcad/orcad-secret-sealing.ts`；全部文件位于 `<Vault>/.huhu/safe/` | 满足“Vault 为根、软件内用主密码解密、不用系统钥匙串”；只用 Node 内置加密原语和已有封装格式 | 系统钥匙串、safeStorage；自定义加密算法 |
| D-15 | 文件历史、差异、Git 与远端同步复制 Open Knowledge：shadow Git 历史（`server/src/shadow-repo.ts`、`timeline-query.ts`）、`sync-engine.ts`（off/follow/full）、`conflict-authority.ts`、相关 UI；历史仓库放 `<Vault>/.huhu/history/git` | 原型版本模块已按 OK 操作组织；OK 有完整测试与冲突模型 | WebDAV/本地复制提供方（原型 `system.jsx#Versioning` 为未路由的旧代码） |
| D-16 | 差异视图用 `@pierre/diffs` 1.3.6 + `diff` 8（OK `ActivityPanelDiffView.tsx`）；属性差异用 OK `core/src/frontmatter-diff.ts` | 现成、已在 OK 生产使用 | 原型自写 ReviewDiff 组件 |
| D-17 | UI 技术：React 19.2、Tailwind CSS 4、shadcn/ui（radix-ui）、lucide-react、sonner、cmdk、react-resizable-panels 4、@tanstack/react-query 5、@tanstack/react-virtual 3、@tanstack/react-table 8、react-day-picker 9、@dnd-kit、zustand 5（仅界面状态） | Orca 与 OK 两个参考项目都用 shadcn + Tailwind 4；可原样复制其组件，只映射 HUHU 语义 token | 继续使用原型手写 CSS（无法直接复用参考组件） |
| D-18 | 视觉基线沿用原型：Geist/Geist Mono、中性色、窄 rail、紧凑工具栏、Pearl/SuliWorld/Soft 三主题 × 明暗；token 数值取自原型 `ui/refinement.css` | 原型已完成视觉验收，用户要求保持统一 | 采用参考项目的默认外观 |
| D-19 | 模块二级导航统一为“模块侧栏”；页内视图切换统一为分段控件 | 原型存在四种二级导航形态（顶部条带、侧栏、整列侧栏、头部 tabs），整合为一种以消除拼凑感 | 保留各页面各自的导航形态 |
| D-20 | 调度唯一使用 Croner 11（IANA 时区）；排期 UI 复制 Orca `AutomationSchedulePicker.tsx` 与 `AutomationCustomCronPanel.tsx` | 原型已用 Croner 计算预览；Orca UI 成熟 | 引入第二套 cron 解析器 |
| D-21 | CLI 用 commander 14，MCP 用官方 `@modelcontextprotocol/sdk`（与 OK 同一 1.x 线），HTTP 用 Hono 4 + `@hono/node-server`，日志用 pino 10，校验用 zod 4.6 | 均为 OK 实际依赖（`packages/cli`、`packages/server`） | 自研协议或参数解析 |
| D-22 | 写入：单 Vault 单写者锁（proper-lockfile 4.1.2），单文件原子写（write-file-atomic 7），多文件操作用 `.huhu/operations/` 日志 + 备份，崩溃后按日志恢复 | OK、Orca 都依赖 proper-lockfile；原型已用 write-file-atomic；跨文件不承诺 ACID，靠日志可解释恢复 | 数据库事务 |
| D-23 | 外部文件变更监听复制 OK `server/src/file-watcher.ts`（@parcel/watcher，chokidar 回退）与 `disk-receipts.ts`（区分自身写入） | 已在 OK 处理重命名、去抖与自写回声 | 自写 fs.watch 封装 |
| D-24 | 原型的演示工具（演示口令、故障演练、样例检测、演练运行）不进入产品；对应位置换成真实行为与真实错误状态 | 它们只为原型说明“真实系统未接入” | 在产品中保留演示开关 |
| D-25 | 不签名、不公证；三平台产物：Windows NSIS 安装包、macOS DMG（arm64）、Linux AppImage + deb；每个产物附 SHA-256 | 用户明确不要求签名；electron-builder 原生支持这些目标 | 首版接入签名/公证、自动更新 |
| D-26 | 不做应用级全局数据库与最近 Vault 持久列表；最近打开记录只保留在本次运行中 | 原型启动页明确“最近记录仅留在本次运行” | 在 userData 保存跨会话最近列表 |
| D-27 | 项目许可证为 GPL-3.0-or-later | 复制的 Open Knowledge 源码在 package.json 声明 GPL-3.0-or-later；用户确认项目个人使用且完全开源 | 宽松许可证（与复制的 GPL 代码冲突） |
| D-28 | 首版界面语言只提供简体中文；文案集中在 `packages/workbench/src/i18n/zh-CN.ts`，用 i18next 读取 | 原型全中文；集中文案避免散落 | 首版多语言 |
| D-29 | 外部 Agent 指南固定为 Vault 内三份文件 `.agents/skills/huhu/{SKILL.md,references/cli.md,references/mcp.md}`，由 agent-guide 插件维护 | 原型 `builtin-guide-model.js` 与示例 Vault 已如此 | 独立 Skill 管理模块 |
| D-30 | Agent CLI 可视变更审查保留为会话详情中的按需面板：展示 Space 工作树的 Git 差异与审查意见，意见经同一会话输入发送 | 原型 `agent-cli-review.jsx` 定义了审查流程（当前未接线），产品需要它让 Agent 改动可审查 | 删除审查能力 |
| D-31 | UI 层不采用 Tailwind 4 + shadcn（取代 D-17 中的这一部分）：原型 CSS 原样放入 `packages/ui/src/styles/proto/`（按原型的导入顺序，字体内联），`components.css` 只补原型缺失的类；交互组件用 Radix 与手写的薄封装（`@huhu/ui`）。其余依赖（lucide-react、sonner、@tanstack/react-query、zustand、diff 等）仍按 D-17 | 用户要求逻辑、排版、间距、像素、配色必须与原型一致；原型样式就是规格，改写成 Tailwind 工具类会引入像素偏差并丢失原型的层叠顺序 | 逐个用 Tailwind 重写（像素对照成本高、易偏） |
| D-32 | 当前版本号为 0.0.1（取代 release.md §2 中“首版为 1.0.0”的设定）；版本单一来源仍是根 `package.json`，`scripts/sync-version.mjs --check` 进 CI | 用户的目标明确为“可正式 release 0.0.1 版本” | 1.0.0 |
| D-33 | 应用退出前由 Main 请求界面落盘（最多等 3 秒）：自动保存模式写文件，手动保存模式留草稿；`HUHU_VAULT` 只在路径已存在时才跳过启动页 | 防抖窗口内的编辑不能因退出丢失；环境里残留的错误路径不应静默建出空 Vault | 直接停 Engine |
| D-34 | 全文索引由 `@orama/orama` 改为 Node 内置的 `node:sqlite`（FTS5 内存库），分词仍用自己的 `tokenize`（中文二元切分）；移除 `@orama/orama` 依赖（修改 architecture.md §技术选型与 reuse.md R-11） | quality.md §3 要求 scale-vault 下 Engine 常驻内存 ≤ 600 MiB；Orama 的 JS 对象索引实测 590–720 MiB 且不能稳定达标（压缩文档仓、建完整理堆都试过）；换成 SQLite 后为 385 MiB，建索引更快，且是运行时自带的能力、不新增依赖（复用优先级 ③ 之内的替换） | 继续用 Orama 并放宽目标；引入第三方 SQLite 绑定（原生模块，打包与三平台成本更高） |

| D-35 | 首个预发布版本号为 0.0.1-rc.1（标签 `v0.0.1-rc.1`；release 工作流要求标签与根 package.json 的 version 一致，sync-version 支持预发布后缀）；rc 通过三平台 CI 与 release 草稿的人工验证后，再把版本改回 0.0.1 并打正式标签 | 用户要求先打预发布标签；三平台打包与冒烟此前从未在 CI 上跑过 | 直接用 v0.0.1 作为预发布标签（无法与正式版区分） |
