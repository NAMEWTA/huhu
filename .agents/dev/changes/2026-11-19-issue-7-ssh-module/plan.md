# #7 SSH 客户端与开发工作区实施索引

用户在 Huhu 的主机、工作区、文件、监控与设置入口操作同一组 SSH 对象。 交付编号沿用原计划，每个子编号链接到唯一任务正文。[行为规格](spec.md) · [架构及产品决定](design.md) · [原 Issue 与验收编号](source.md)

开发依据为 Huhu 当前检出 `9f870c0`、Motty 默认分支 `main@2daa9db582e1` 与同级 Viva `main@a5da67aa6344`。固定版本的来源引用用于追溯。本轮交付为 Markdown 规划；下表依赖指实施时所需的合同或产物。[批次源码清单](../2026-11-19-huhu-issues-3-10/sources.md)

## 切片与依赖

| 上级 | 可独立接手的交付 | 前置产物所在切片 |
| --- | --- | --- |
| H1 | [H1.1 从 Huhu 功能定位到可复用源码与许可](tasks/H1.1-upstream-map.md) | 可独立开始 |
| H1 | [H1.2 核实单一执行组件的分发前提](tasks/H1.2-executor-boundary.md) | [H1.1](tasks/H1.1-upstream-map.md) |
| H2 | [H2.1 在目录内找到并整理选中的主机](tasks/H2.1-host-directory.md) | 可独立开始 |
| H2 | [H2.2 保存并按版本修改一台主机](tasks/H2.2-host-record.md) | [H1.2](tasks/H1.2-executor-boundary.md)、[#9](../2026-11-19-issue-9-safe-accounts/spec.md) |
| H2 | [H2.3 删除前查看主机引用与处理结果](tasks/H2.3-host-references.md) | [H2.2](tasks/H2.2-host-record.md) |
| H2 | [H2.4 预览外部主机配置后按选项导入](tasks/H2.4-import-preview.md) | [H2.2](tasks/H2.2-host-record.md) |
| H2 | [H2.5 区分已存私钥、文件引用与 agent](tasks/H2.5-key-library.md) | [H1.2](tasks/H1.2-executor-boundary.md)、[#9](../2026-11-19-issue-9-safe-accounts/spec.md) |
| H2 | [H2.6 用未保存主机表单查看测试反馈](tasks/H2.6-draft-test.md) | [H1.2](tasks/H1.2-executor-boundary.md) |
| H3 | [H3.1 重新打开连接仍能看到当前信任和认证提示](tasks/H3.1-trust-and-prompts.md) | [H2.2](tasks/H2.2-host-record.md) |
| H3 | [H3.2 编辑并验证目标到直接跳板的关系](tasks/H3.2-route-editor.md) | [H2.2](tasks/H2.2-host-record.md) |
| H3 | [H3.3 在多跳连接中指出失败位置和代理归属](tasks/H3.3-route-attempt.md) | [H3.1](tasks/H3.1-trust-and-prompts.md)、[H3.2](tasks/H3.2-route-editor.md) |
| H3 | [H3.4 区分一次导入和持续配置同步](tasks/H3.4-config-sync.md) | [H2.4](tasks/H2.4-import-preview.md)、[H3.2](tasks/H3.2-route-editor.md) |
| H3 | [H3.5 查看辅助代理分享与还原的状态](tasks/H3.5-proxy-sharing.md) | [H3.3](tasks/H3.3-route-attempt.md) |
| H4 | [H4.1 用主机列表预览和保存工作区模板](tasks/H4.1-workspace-template.md) | [H2.1](tasks/H2.1-host-directory.md) |
| H4 | [H4.2 启动工作区时独立呈现每个 Pane 结果](tasks/H4.2-workspace-launch.md) | [H4.1](tasks/H4.1-workspace-template.md)、[H3.1](tasks/H3.1-trust-and-prompts.md) |
| H4 | [H4.3 移动分栏时保留运行与焦点](tasks/H4.3-pane-layout.md) | [H4.2](tasks/H4.2-workspace-launch.md) |
| H5 | [H5.1 在 Shell 视图辨认输入归属与显示能力](tasks/H5.1-shell-view.md) | [H3.1](tasks/H3.1-trust-and-prompts.md) |
| H5 | [H5.2 只向指定 Pane 广播或插入快捷文本](tasks/H5.2-terminal-actions.md) | [H4.3](tasks/H4.3-pane-layout.md)、[H5.1](tasks/H5.1-shell-view.md) |
| H5 | [H5.3 按会话查看日志和显式录制的回放](tasks/H5.3-terminal-history.md) | [H5.1](tasks/H5.1-shell-view.md) |
| H5 | [H5.4 独立选择本机 Shell 或 WSL](tasks/H5.4-local-shell.md) | [H1.2](tasks/H1.2-executor-boundary.md) |
| H6 | [H6.1 切换终端时独立双栏仍绑定原会话](tasks/H6.1-file-session.md) | [H3.1](tasks/H3.1-trust-and-prompts.md) |
| H6 | [H6.2 在绑定文件会话内修改测试文件属性](tasks/H6.2-file-changes.md) | [H6.1](tasks/H6.1-file-session.md) |
| H6 | [H6.3 编辑远端文本时发现并发修改](tasks/H6.3-text-edit.md) | [H6.1](tasks/H6.1-file-session.md) |
| H6 | [H6.4 在空闲 Shell 与文件面板之间同步目录](tasks/H6.4-directory-follow.md) | [H6.1](tasks/H6.1-file-session.md)、[H5.1](tasks/H5.1-shell-view.md) |
| H7 | [H7.1 在传输中心找回所属任务](tasks/H7.1-transfer-queue.md) | [H6.1](tasks/H6.1-file-session.md) |
| H7 | [H7.2 在覆盖与续传时保护原目标](tasks/H7.2-transfer-conflicts.md) | [H7.1](tasks/H7.1-transfer-queue.md) |
| H7 | [H7.3 显示压缩支持与客户端文件归属](tasks/H7.3-archive-transfer.md) | [H7.1](tasks/H7.1-transfer-queue.md) |
| H8 | [H8.1 保存四类转发规则并看清监听位置](tasks/H8.1-forward-config.md) | [H2.2](tasks/H2.2-host-record.md) |
| H8 | [H8.2 从规则列表追踪运行实例和恢复状态](tasks/H8.2-forward-runtime.md) | [H8.1](tasks/H8.1-forward-config.md)、[H3.3](tasks/H3.3-route-attempt.md) |
| H9 | [H9.1 观察活动 Pane 的指标与采样缺口](tasks/H9.1-session-monitor.md) | [H4.2](tasks/H4.2-workspace-launch.md) |
| H9 | [H9.2 保存多主机面板并按需共享采样](tasks/H9.2-monitor-panels.md) | [H2.1](tasks/H2.1-host-directory.md)、[H3.1](tasks/H3.1-trust-and-prompts.md) |
| H9 | [H9.3 查看固定主机的进程和容器工具窗口](tasks/H9.3-server-tools.md) | [H3.1](tasks/H3.1-trust-and-prompts.md) |
| H10 | [H10.1 预览布局与终端设置的实际作用域](tasks/H10.1-layout-terminal-settings.md) | [H5.2](tasks/H5.2-terminal-actions.md)、[H5.3](tasks/H5.3-terminal-history.md)、[H5.4](tasks/H5.4-local-shell.md) |
| H10 | [H10.2 分开显示即刻生效与下次连接的设置](tasks/H10.2-connection-file-settings.md) | [H3.3](tasks/H3.3-route-attempt.md)、[H6.1](tasks/H6.1-file-session.md)、[H7.1](tasks/H7.1-transfer-queue.md) |
| H10 | [H10.3 从 SSH 设置查看公共工具选择](tasks/H10.3-shared-tool-settings.md) | [#6](../2026-11-19-issue-6-unified-tools-web/plan.md) |
| H11 | [H11.1 从每个 SSH 用户动作查到同一资源](tasks/H11.1-resource-catalog.md) | [#6](../2026-11-19-issue-6-unified-tools-web/plan.md) |
| H11 | [H11.2 查询已授权作业和输出游标](tasks/H11.2-session-jobs.md) | [H3.1](tasks/H3.1-trust-and-prompts.md)、[H5.1](tasks/H5.1-shell-view.md)、[H11.1](tasks/H11.1-resource-catalog.md) |
| H11 | [H11.3 分别演练 MCP 和 CLI 的同一操作流程](tasks/H11.3-entry-parity.md) | [H11.1](tasks/H11.1-resource-catalog.md)、[H11.2](tasks/H11.2-session-jobs.md)、[H7.2](tasks/H7.2-transfer-conflicts.md)、[#6](../2026-11-19-issue-6-unified-tools-web/plan.md) |
| H12 | [H12.1 核查切 Vault 与停插件后的资源归属](tasks/H12.1-lifecycle-cutover.md) | [H4.2](tasks/H4.2-workspace-launch.md)、[H7.2](tasks/H7.2-transfer-conflicts.md)、[H8.2](tasks/H8.2-forward-runtime.md)、[H9.2](tasks/H9.2-monitor-panels.md)、[H11.2](tasks/H11.2-session-jobs.md) |
| H12 | [H12.2 按平台交接单一执行层及功能证据](tasks/H12.2-platform-evidence.md) | [H1.2](tasks/H1.2-executor-boundary.md)、[H2.3](tasks/H2.3-host-references.md)、[H2.5](tasks/H2.5-key-library.md)、[H2.6](tasks/H2.6-draft-test.md)、[H3.4](tasks/H3.4-config-sync.md)、[H3.5](tasks/H3.5-proxy-sharing.md)、[H6.2](tasks/H6.2-file-changes.md)、[H6.3](tasks/H6.3-text-edit.md)、[H6.4](tasks/H6.4-directory-follow.md)、[H7.3](tasks/H7.3-archive-transfer.md)、[H9.1](tasks/H9.1-session-monitor.md)、[H9.3](tasks/H9.3-server-tools.md)、[H10.1](tasks/H10.1-layout-terminal-settings.md)、[H10.2](tasks/H10.2-connection-file-settings.md)、[H10.3](tasks/H10.3-shared-tool-settings.md)、[H12.1](tasks/H12.1-lifecycle-cutover.md)、[H11.3](tasks/H11.3-entry-parity.md) |

## 执行顺序与归属

- 来源核对、目录编辑和导入样本等本地准备可并行。需要真实连接或本地 PTY 的实施验收使用 H1.2 验证过的执行组件。H2.2、H2.5 使用 [#9 的模块凭据存储合同](../2026-11-19-issue-9-safe-accounts/spec.md)。Q7-1 仅影响有引用主机的删除行为。
- SSH 领域独占连接、等待项、会话、文件、转发和监控对象。工作台维护视图和当前选区，#6 拥有公共授权与适配器。[H11.1](tasks/H11.1-resource-catalog.md) 可先核对稳定对象合同；综合入口的运行证据由 [H11.3](tasks/H11.3-entry-parity.md) 与 #6 对接。终端、文件与监控各自释放所持对象。
- HTML 原型始终离线，仅使用合成主机、指纹、终端、文件、端口和指标。原型走查记录布局、交互和状态反馈。
- 实施交付从应用和实际适配器验收。用临时 Vault、专用测试账号及已授权测试主机核对信任、PTY、SFTP、转发与监控；记录实际对象、结果和释放状态。用隔离夹具补充难以稳定制造的竞态或故障。新格式的备份恢复使用测试资料。
- [H1.2](tasks/H1.2-executor-boundary.md) 有本地组件构建与运行验收；[H12.2](tasks/H12.2-platform-evidence.md) 从安装包启动应用，检查缺件失败并逐平台记录结果。未运行的平台保留待验。

## 从规格反查

| 需求范围 | 来源编号 | 实施与验收正文 |
| --- | --- | --- |
| 目录、导入、认证及主机引用 | H01–H10；A01、A21 | [H2.1](tasks/H2.1-host-directory.md)、[H2.2](tasks/H2.2-host-record.md)、[H2.3](tasks/H2.3-host-references.md)、[H2.4](tasks/H2.4-import-preview.md)、[H2.5](tasks/H2.5-key-library.md)、[H2.6](tasks/H2.6-draft-test.md)、[H3.1](tasks/H3.1-trust-and-prompts.md)、[H3.4](tasks/H3.4-config-sync.md)、[H5.3](tasks/H5.3-terminal-history.md) |
| 信任、多跳路由与代理 | R01–R07；A02、A03 | [H3.1](tasks/H3.1-trust-and-prompts.md)、[H3.2](tasks/H3.2-route-editor.md)、[H3.3](tasks/H3.3-route-attempt.md)、[H3.4](tasks/H3.4-config-sync.md)、[H3.5](tasks/H3.5-proxy-sharing.md) |
| 工作区绑定、布局与 Shell | W01–W06、§6.2；A04–A06 | [H4.1](tasks/H4.1-workspace-template.md)、[H4.2](tasks/H4.2-workspace-launch.md)、[H4.3](tasks/H4.3-pane-layout.md)、[H5.1](tasks/H5.1-shell-view.md)、[H5.2](tasks/H5.2-terminal-actions.md)、[H5.3](tasks/H5.3-terminal-history.md)、[H5.4](tasks/H5.4-local-shell.md) |
| 文件面板、编辑与传输 | F01–F14；A07–A09 | [H6.1](tasks/H6.1-file-session.md)、[H6.2](tasks/H6.2-file-changes.md)、[H6.3](tasks/H6.3-text-edit.md)、[H6.4](tasks/H6.4-directory-follow.md)、[H7.1](tasks/H7.1-transfer-queue.md)、[H7.2](tasks/H7.2-transfer-conflicts.md)、[H7.3](tasks/H7.3-archive-transfer.md) |
| 转发运行与归属 | P01–P07；A05、A10 | [H8.1](tasks/H8.1-forward-config.md)、[H8.2](tasks/H8.2-forward-runtime.md) |
| 监控与设置 | §10–11；A11、A12 | [H9.1](tasks/H9.1-session-monitor.md)、[H9.2](tasks/H9.2-monitor-panels.md)、[H9.3](tasks/H9.3-server-tools.md)、[H10.1](tasks/H10.1-layout-terminal-settings.md)、[H10.2](tasks/H10.2-connection-file-settings.md)、[H10.3](tasks/H10.3-shared-tool-settings.md) |
| 公共工具及对象归属 | §12；A13–A16、A21 | [H10.3](tasks/H10.3-shared-tool-settings.md)、[H11.1](tasks/H11.1-resource-catalog.md)、[H11.2](tasks/H11.2-session-jobs.md)、[H11.3](tasks/H11.3-entry-parity.md) |
| 单一执行层、许可与三个分发平台 | §13–15；A17–A20 | [H1.1](tasks/H1.1-upstream-map.md)、[H1.2](tasks/H1.2-executor-boundary.md)、[H12.1](tasks/H12.1-lifecycle-cutover.md)、[H12.2](tasks/H12.2-platform-evidence.md) |

## 原型确认与交接

原型对照 Huhu 自有导航中的主机、信任、工作区 Shell、SFTP、路由、转发、监控与设置。Motty 源码提供功能与信息结构参考，界面按 Huhu 主题、组件和语言实现。 用户尚未确认 HTML 版本。各界面片列出具体场景，按版本指纹、已走查状态和覆盖范围确认；未展示的状态保留为待核范围。原型及其记录由同批原型负责人维护。[打开原型](prototype/index.html) · [原型确认记录](prototype-review.md)
