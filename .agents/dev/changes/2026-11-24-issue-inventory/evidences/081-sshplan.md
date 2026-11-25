# SSHPlan · 已启动面板的 SSH 采样计划

状态：通过（Linux 桌面，回环 SSH）。

[实施票据](../tasks/081-sshplan.md)

- 版本：提交 `5a07848e`，main `febf92ea`。
- 实现：工作台显式启动的命名面板登记稳定计划，来源与中心共用修订与周期；中心删除释放面板引用，暂停保留已开面板与数据，最后引用结束释放连接；仅保存的面板不连接，停止或 Engine 重开后需从面板启动；临时侧栏与外部授权运行沿用各自租约。采样事实与面板租约仍归 SSH 领域。
- 单测：ssh monitor.engine 3/3（回环 Linux/Windows 采样、同主机共用采样源、暂停与删除、断线重连、最后引用释放）。
- E2E（Lead，X11）：ssh/monitoring「Workbench monitors a saved panel in the background and controls the active Pane separately」通过。
