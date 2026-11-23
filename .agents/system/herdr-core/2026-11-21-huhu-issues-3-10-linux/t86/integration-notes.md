# Lead 接线记录，2026-11-22

补充原 task01 的 Linux 原生环境与已批准终端集成，原任务/报告编号不变。

- Automations 已在 integration 提交 fc38dc86，固定 shell 输入类型在 plugins/automations/src/engine/approved-linux-shell.ts，调用方 terminal-environment.ts；单文件 34 项通过，不代表真实启动通过。
- Worker 已宣布 SessionsService.launchApprovedShell(input, signal) 方法，返回原 Session。Lead 持有 plugins/agent-cli/src/engine/index.ts 并增加私有 agentProtectedTerminal.launchApprovedShell 服务注册，调用后 waiting.poke()，返回 {id}。该文件改动暂未提交，等组合验证。
- Worker 持有 Agent 实现与 native/agent-pty，Linux helper 要输出 bin/huhu-agent-pty，提供 build.sh；Lead 已在 56cde0fe 配好桌面 resources/agent-pty/huhu-agent-pty 和 before-pack。
- 私有批准路径固定 argv 与映像，Helper 实际执行前复核并使用同一验证映像，保持一次性票据和原请求对账，不增加公开 capability。
- Lead 收报告后串行执行 Go 构建、受影响类型检查、真实 Core 单文件与必要 E2E，worker 不做重型验证。SSH 不在范围。
