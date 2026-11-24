# H9.1/H9.2 绑定监控 Windows 验收

对照本机 Motty `2daa9db582e16edf60a60b7ada26f47f808f973c` 的 `remotestats/stats.go`、`windows.go` 与 `monitoring/history.go`。实现 Linux procfs 计数、Windows CIM 读取，以及按连接聚合需求后使用最快周期。采样命令固定，只读取状态。

- Windows 回环 SSH 提供 Linux/Windows 合成数据。通过 Engine 获取两个真实 SSH 连接各自样本。Linux CPU 根据两次计数计算，Windows 读取固定返回值。拒绝跨主机使用分栏。暂停时该来源采样停止，历史标记空隙。断线后拒绝在旧分栏重试，重新连接从新连接和空历史开始。关闭监控保持终端在线。
- 保存快慢两个面板，保存阶段无拨号。开始后，同一测试主机只使用一条专用 SSH 连接。面板共享实际 2 秒周期。暂停快面板时慢面板继续以 5 秒周期，停止最后订阅实际释放 SSH。读取被拒的另一台主机保留独立状态，显式重试恢复。重开 Vault 仅加载面板定义。
- 实际 Electron Workbench 创建面板并选择历史范围，核对回环 CPU 值。退出面板后回环仍收到采样。进入工作区，切换停靠与周期，暂停出现空隙，继续恢复，关闭监控后终端仍就绪。

运行 `vitest run --no-cache --pool forks --maxWorkers 1 plugins/ssh/test`（69 项通过），及 `playwright test -c plugins/ssh/e2e/playwright.config.ts -g 'Workbench monitors'`（1 项通过）。

验证范围为 Windows 应用、隔离 Vault、回环 SSH 和合成样本。GPU 和无适配的系统显示明确原因。历史保存在 Engine 进程，每主机每订阅最多 1800 个时间点，长范围聚合时间桶。