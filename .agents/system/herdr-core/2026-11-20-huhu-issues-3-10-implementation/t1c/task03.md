# task03.md #6 G2.1 Vault 工具选择与版本

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t1c
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t1c`
- 当前任务 — task03.md
- 任务路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/task03.md
- 报告路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report03.md
- Lead 收件 — 回告终稿绝对路径，外部 Lead 主动收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/capability
- 前置 — 在 G1.2 候选 `6e6240d5573dcf0c825680a7d0dfcb6ccf971a4e` 上继续。G1.2 独立审查读固定 SHA；本片提交单列。

## 目标与验收

按 G2.1、#6 规格、设计及项目现有 Dispatcher/ExposureStore/Vault 条件写实现。每个 Vault 的干净安装业务工具默认关闭，能区分未配置与明确关闭，持久读取明确选择和 revision。损坏或无法安全解释时保留原件，给出只读可观察的配置错误并拒绝受影响外部调用。沿既定新格式工作。以真实 HTTP、CLI 和 MCP 发现/调用方定位管理协议、业务工具和鉴权的边界，防止默认关闭导致无工具时连标准发现也无法工作，或管理查询绕过用户授权。G2.2 的整批提交与版本竞争另切片。

使用两个隔离 Vault，配置一项允许，重启、加新能力、明确关闭、损坏原件、按实际入口调用与目录状态。列出受影响的调用方及现有回归是否需从旧默认行为切换为显式授权。记录真实命令、候选本地提交及证据。

## 读写范围

可写 packages/kernel/src/exposure.ts、capabilities/system.ts、必要的 Dispatcher/发现判定对接，packages/contracts/src/capability.ts、apps/engine/src/boot.ts 和相关测试。t1c 继续独占当前 Engine 装配。若 CLI/MCP 入口需随新默认调整，其业务授权改变需先定位具体调用方，在本切片只做标准发现和真实授权所需最小修改，报告说明。Renderer、插件全局注册、根锁、Vault 包收集器归 Lead。沿 dev-build、dev-verify。原型确认相关的可见呈现后续执行。禁止真实数据和远端写入，禁止再派代理。

按 Core 文件协议核对本机、当前身份、active 指针与同号报告，使用独立夹具，提交后以不覆盖目标的方式发布报告并回告路径。
