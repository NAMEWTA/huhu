# 实施计划

目标：交付 [product](product.md) §2 的全部模块，在三个目标平台产出可安装、通过 [quality](quality.md) §4 门槛的 1.0.0。
任务格式与公共规则：[tasks/README](tasks/README.md)。

## 1. 阶段与工作包

| 阶段 | 工作包 | 交付的可演示结果 | 真实依赖 |
| --- | --- | --- | --- |
| 0 基础 | [W01 工程基线](tasks/W01-foundation.md) | 空工作台窗口在三平台 CI 中构建、测试、打包成功 | 无 |
| 0 | [W02 设计系统与外壳](tasks/W02-design-shell.md) | 带 rail/标签/模块侧栏/命令面板/六主题的外壳，组件预览页 | W01 |
| 0 | [W03 Engine 与能力管线](tasks/W03-engine.md) | Engine 进程启动；Renderer 与 CLI 通过同一 Dispatcher 调用 `vault.info` | W01 |
| 0 | [W04 Vault 持久化与索引](tasks/W04-vault.md) | 打开/新建/切换 Vault；语义 Markdown 读写、操作日志恢复、监听、全文检索 | W03 |
| 1 内容 | [W05 知识库文件](tasks/W05-notes-files.md) | 文件树与全部文件操作、双链更新、回收站、日记、标签、星标 | W02、W04 |
| 1 | [W06 编辑器](tasks/W06-editor.md) | 四模式编辑、保存与草稿、外部修改合并、多文件类型、属性/大纲/关联 | W05 |
| 1 | [W07 批注](tasks/W07-comments.md) | 选区批注、重定位、批注 Markdown 文件 | W06 |
| 1 | [W08 任务](tasks/W08-tasks.md) | 任务全部界面与规则、资源选择、提醒 | W02、W04 |
| 1 | [W09 档案](tasks/W09-archives.md) | 类型/字段/档案/关系/迁移 | W02、W04；W09.4 需 W08.1 |
| 1 | [W10 收件箱](tasks/W10-inbox.md) | 捕获与三种转换、撤销 | W05.1、W08.1、W09.2 |
| 2 执行 | [W11 保险箱](tasks/W11-safe.md) | 主密码、条目、SecretUse、自动锁定 | W02、W04 |
| 2 | [W12 Agent CLI](tasks/W12-agent-cli.md) | Herdr 打包与客户端、Space、检测、启动菜单、终端与分屏、历史与恢复、审查 | W02、W04 |
| 2 | [W13 自动化](tasks/W13-automations.md) | 规则与调度、扫描与无界面 worker、问答续接、对账、脚本与通知动作 | W08、W12.4；W13.5 需 W11.3 |
| 2 | [W14 SSH](tasks/W14-ssh.md) | 主机、逐跳信任、Shell、Exec、SFTP、审计 | W11.3、W12.2 |
| 3 系统 | [W15 版本历史与同步](tasks/W15-versioning.md) | 文件历史与恢复、Git、同步、冲突 | W06；W15.2 需 W13.3 |
| 3 | [W16 插件中心与外部插件](tasks/W16-plugins.md) | 启停与贡献撤销、外部扩展安装与宿主进程 | W03、W02 |
| 3 | [W17 能力网关与指南](tasks/W17-gateway-guide.md) | MCP stdio/HTTP、CLI 命令集、HTTP 服务、测试台、指南维护 | W03、W16.1 |
| 3 | [W18 首页、通知、健康、设置](tasks/W18-home-health-settings.md) | 首页卡片与专注习惯、通知中心、诊断、设置与数据存储页 | W05、W08、W10、W13 |
| 4 收尾 | [W19 集成、性能与无障碍](tasks/W19-integration.md) | 三个跨模块工作流 E2E、性能目标测量达标、axe 通过 | W05–W18 |
| 4 | [W20 首版发布](tasks/W20-release.md) | 三平台安装包、校验和、冒烟、Release 草稿 | W19 |

## 2. 并行边界

- W02 与 W03 在 W01 后并行：W02 只写 `packages/ui`、`packages/workbench`（外壳部分），W03 只写 `packages/contracts`、`packages/kernel`、`apps/engine`、`apps/cli`（骨架）。二者在 W03.4 交汇（Renderer 的 engine 客户端由 W03 负责，W02 只消费）。
- W04 完成后，W05、W08、W11、W12、W16 可并行，各自只写自己的插件目录；对 `packages/contracts` 的新增（kind 模式、DTO）由各包作者提交，`contracts/src/index.ts` 的导出列表由 W03 负责人合并。
- `packages/ui` 新组件：谁首先需要谁实现（例如 ResourcePicker 由 W08，DiffView 由 W06，TerminalView 由 W12），实现前在 PR 描述中登记，避免重复。
- 共享文件唯一写入者：`architecture.md`/`interfaces.md` 定义的公共契约文件（`contracts/src/capability.ts`、`errors.ts`、`events.ts`、`plugin-manifest.ts`）由 W03 负责人维护，其他任务通过 PR 提出新增错误码或事件。

## 3. 关键路径

W01 → W03 → W04 → W08 → W12.4 → W13 → W19 → W20。Herdr 二进制打包（W12.1）在 W12 一开始完成，以尽早暴露三平台进程与命名管道问题。W01.4 在第一周就产出三平台安装包冒烟，避免打包问题拖到最后。

## 4. 风险与应对

| 风险 | 影响 | 应对与验证点 |
| --- | --- | --- |
| Herdr Core 在某平台行为与文档不符（ConPTY、命名管道、长时间保持） | Agent CLI 与终端不可用 | W12.1 在三平台 CI 上跑通 run/attach/detach/重启 Engine 后重连，作为 W12 其余任务的开工门槛；不通过时在 W12.1 内定位原因（配置、环境变量、端点路径）并向上游提交最小复现，不另起终端实现 |
| Atomic inline-preview 与新版 CodeMirror 不兼容 | 实时预览不可用 | W06.1 首先迁移并运行原型编辑器的行为测试；不兼容时按其补丁说明修正（扩展仅 7 个文件） |
| provider CLI 打印模式参数随版本变化 | 自动化运行失败 | AA 适配器按版本探测（R-36 版本探测）；fake provider 契约测试 + 发布前真实 CLI 手测 |
| 大 Vault 启动慢 | 体验差 | W04.5 先实现增量索引与后台构建；W19.3 测量 |
| 文件监听在 Linux inotify 上限不足 | 漏掉外部修改 | W04.4 回退轮询并在健康中心提示 |
