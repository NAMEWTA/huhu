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
| W12 Agent CLI（部分） | Space、Provider 检测、会话启动/中断/结束/重命名、Herdr Core 实例隔离、终端 attach（WS 桥 + xterm，真实 Core 验证输入/resize/退出码/重开）、基础模块界面；无分屏、历史扫描、恢复会话、变更审查、Space 管理界面、设置对话框 | 单元 + 真实 Core 集成 + Playwright |
| W13 自动化（部分） | 规则能力、Croner 调度与补跑、预览、立即运行、进程 worker、激活记录、claim；无 agent_prompt/script 动作、问答续接、取消/对账、监督进程、界面 | 单元 + 假 CLI 端到端 |
| W15 版本历史（部分） | shadow 仓库文件历史（记录/时间线含改名/读取/命名版本/恢复含恢复前检查点）、规则文件恢复后暂停；无 Git 页、同步、冲突、`holdRestoredInput` 接线、界面 | 单元 + HTTP |
| W17 网关（部分） | `huhu mcp`（stdio，身份 mcp）、`capabilities.list`、`plugins.list/setEnabled`、CLI 便捷命令；无 HTTP 服务/令牌、MCP over HTTP、测试台、指南维护 | 集成 |
| W14 SSH（部分） | 主机配置（跳板循环检测）、known_hosts 逐跳信任（首次提示/变化拒绝且不发送凭据）、多跳连接、Exec（中断/超时）、审计、凭据只经 SecretUse；用 ssh2 假服务器验证。无 Shell/终端流、SFTP、界面 | 单元 + HTTP |
| W16 插件中心（部分） | 内置插件启停（含依赖级联确认）、偏好持久化到 plugins.json、rail/标签按启用状态即时过滤、清单（huhu-plugin.json）成为 Engine 注册的唯一来源、停用后能力返回 PLUGIN_DISABLED；无外部插件安装/宿主进程、权限页 | 单元 + HTTP + Playwright |
| W18（部分） | 站内通知、设置（仅外观）、首页（概览卡片+最近笔记，插件停用时卡片为 0）、健康中心（插件/文件问题/索引/监听/保险箱检查）；无首页卡片自定义、专注计时、习惯、诊断导出、设置的编辑器/日期时间/快捷键/数据与存储页 | 单元 + Playwright |
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
