# #5 E07 控制台中继第一轮修复回归诊断

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t18r`
- 任务 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18r/task02.md`
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18r/report02.md`

继续上次只读授权范围。Lead 已在 task-cutover 的 plugins/agent-cli/src/engine/protected-launch.ts 新增 Windows -EncodedCommand 中继（尚未提交），撤回空 PTY 重试和 helper 管道微调。固定 pnpm 的 t18s 报告 terminal-cutover-desktop.log profile 中 module-credential-host.test.ts:212 state failed。请在 Windows 合成夹具诊断当前生成的真实 argv 如何解析及差异，提出小范围修复；验证含空格 Helper 路径、stdout、exit、以及 Core argv 原地址保留。仅可写报告和自己的 temp 夹具，禁止产品源码、项目测试或其他文件改动。不要输出秘密或真实测试认证。
