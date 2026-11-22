# task04.md 修复目录审查后合并校验策略

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t1c
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t1c
- 当前任务 — task04.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report04.md
- Lead 收件 — 回告终稿绝对路径。
- 实施目录 — D:/Document/code/huhu/temp/issue-worktrees/capability，继续分支 impl/huhu-issues-3-10-capability，从 29a6e8f13bcbd3e644ef9b7a2a463627e6d39735 追加，保留前两候选 SHA。

先读 t20/report04.md 的 G1.2 独立证据。按 dev-build 修复 P2 的卸载残留和 P3 的可变描述。让同一个 Engine 在安装、停用、卸载、可复装时的桌面目录、gateway.check、CLI 和两种 MCP 对同一能力一致。卸载确认未安装与已安装但 handler 缺失分开，调用拒绝前不得落入同名的其他归属。Registry 固定描述，保持登记与活动 handler 的同源输入、输出和身份校验。对照上一轮 29a6e8f 实际授权路径，复跑双 Vault 默认关闭／显式开关、旧 MCP 名及损坏执行拒绝。回写是否影响 G2.1 测试以及两项发现复现与修复的候选 SHA。

可写 capability worktree G1.2／G2.1 的 Kernel Registry、Dispatcher、插件生命周期和相关测试。此轮 Engine 装配唯一写入者继续为 t1c，范围仅限这两个发现的接线。保持新策略文件与 API 不改，发现必须改变时注明原因和直接调用方。禁止远端写入、自行派遣和真实 Vault。仅用隔离 Vault、无副作用合成扩展与回环 Engine。提交可审候选与非覆盖报告，报告中给出重放命令和版本。
