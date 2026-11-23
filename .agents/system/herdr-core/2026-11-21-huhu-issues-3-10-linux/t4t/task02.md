# task02.md #7 批量路由、外部布局和私有 Core 复审

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 当前任务 — `t4t/task02.md`，本机 `wta-ubuntu` 默认 Core
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/report02.md`
- Lead — `t3p`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`，固定证据 SHA `29c3fe32417aa99ad7c4790d3d879218e73cf362`

## 交付

按 dev-review 核对三个改动中真实缺陷和用例缺口。重点看 `29c3fe32` 的批量路由原子发布、credential snapshot、重试与并发 pin；`f2159c2e` 的工作区外部 owner、路由/代次/revision、已经移除的绑定和重交；`951fe442` 与 `d4544abb` 的私有 Core 关闭、RPC 取消和丢失启动回复清理。用本地证据 `temp/issue-evidence/huhu-2026-11-22/` 及 `t4x/report02.md` 反查实际执行。此前已经记录的完整崩溃恢复和脱离 PTY 后代待做，仍核对本轮是否引入回退与影响。对 H3.2 的 CLI/MCP 能力边界和正常工作台入口说明当前实现覆盖。

## 读写和验证

- 只读业务、测试和证据。只允许写自己的当前同号报告和同目录临时稿。无需重新启动服务或派发。不要跑 E2E、构建、打包或全仓检查，不访问真实 Vault、凭据和 Agent 历史，不写远端。
- 核对 tasks、实际终端、manifest 和 Lead 后发布终稿。发现高风险项给具体文件、行、可观察缺陷和最小安全回归判据。

## Lead 验收

由 Lead 复核填写。
