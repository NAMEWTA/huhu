# 原生历史派遣审查修复

- 任务为 `t1fp/task01.md`，Lead 为 `t3p`。工作目录为 `/home/wta/projects/huhu`，基线为 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`。
- 生产代码已冻结，改动在共享工作树，待 Lead 跑类型和 Engine live。共享报告目录和 Core 锁均只读。本报告存放在任务指定的备用路径，由 Lead 收取。

## 修复

1. Tasks 落盘终止后，Agent 核对原 Vault、机器、Task、run、attempt 和 dispatch。已确认未写入的恢复释放首轮占用，并按原 Core 进程代次结束 helper。工作台可结束已取消的会话。已发送或待确认的派遣继续持有相应占用和回执。
2. 恢复首轮在原 socket 写入前同步复核原占用、Space 和有效 Codex 配置。停用 Codex、替换受控配置或失去原占用会阻止提交。核对发生在写入意图落盘之前。已写入派遣继续按原凭据对账。
3. 目录和认领按原 thread 与实际历史文件识别本机占用。同 cwd 的无关交互会话以及相同 UUID 的其他 profile 可并行。固定 App Server 对所选 thread 返回的 writer 拒绝由 helper 签名并绑定原进程和来源，Tasks 记录 `waiting_resource`。确认原尝试未取得写入权后，同一派遣按原意图和冻结来源退避重试。退避期间目录也返回 `history_writer_busy`。首次出现的外部 writer 冲突由实际恢复取得，目录读取现有进程和已取得的拒绝证据。
4. 自动化预览与发生冻结共用 Tasks 的原生历史资格校验，复核原 Space、机器、thread、来源修订、可用性及补充指令形成的正文。忙、失效和不支持的目标进入跳过记录，并保留实际原因。预览使用只读 Core 观察。普通新建及普通已有会话派遣沿用各自的预检和输入路径。

## 实际验证

- 修复前重跑 `node temp/closeout-release/t1fg-review-probe.cjs`。取消后 Core kill 调用 0 次，停用后仍发送 1 次，同 cwd 的无关会话触发忙，失效修订进入预览候选。固定 Codex 的外部 writer 回包见 `temp/closeout-release/codex-resume-protocol.log`。
- 修复后 `node temp/closeout-release/t1fp-postfix-probe.cjs` 通过。取消释放输入并调用原 Core kill，已发送占用仍受保护。停用和配置变更均提交 0 次，原提交及重查合计 1 次。不同 profile 与无关线程互不占用，同来源仍忙。错误进程和错误 MAC 的 writer 回执均被拒绝，已签名冲突可用原派遣退避重试。探针执行源码方法，Core 与 socket 使用替身。输出见 `temp/closeout-release/t1fp-postfix-probe.log`。
- `pnpm exec vitest run plugins/automations/test/service.test.ts -t 'agent 动作：任务输入'` 通过，8 项通过、37 项未选中。覆盖受控历史可用时无 PATH 硬依赖、占用原因、停用、来源修订变化以及预览与冻结一致。输出见 `temp/closeout-release/t1fp-service-vitest.log`。
- 通过 Node 调用 TypeScript Compiler API，沿用项目严格选项检查 18 个改动文件，再复核最终 launch-control schema。两次均为 0 诊断。输出见 `temp/closeout-release/t1fp-focused-types.log`。
- `node --check plugins/agent-cli/src/engine/codex-dispatch-helper.cjs`、`node --check apps/engine/test/fixtures/codex-app-server.cjs` 及 `git diff --check` 的改动路径检查均通过。
- `hc get t3p` 返回只读 Core 锁，退出码 5。未重试。

## 未运行的验证

Worker 未启动真实 Codex、Herdr agent、Electron 或 Playwright，未执行桌面构建、打包、全仓类型检查、lint 或全量测试。HTTP 集成用例曾尝试运行，在开始时被沙箱以 `listen EPERM: operation not permitted 127.0.0.1` 阻断，见 `temp/closeout-release/t1fp-automations-vitest.log`。

Lead 串行运行以下用例。Engine live 覆盖普通受控新建、原键重查、等待 ACK 后停用、取消后工作台结束及 writer 退出、首轮前停用及拒绝后退避重试。C01 核对真实原 thread、同一 rollout、原 cwd、问答和一轮结果。

```bash
HUHU_AGENT_LAUNCH_TEST_BIN="$PWD/apps/desktop/resources/herdr/linux-x64/herdr-core" pnpm exec vitest run apps/engine/test/codex-dispatch.live.test.ts -t 'Engine dispatch uses one original Core helper and accepts only its correlated native Codex response'
pnpm exec vitest run plugins/automations/test/task-scan-occurrences.test.ts -t '扫描预览与发生共同使用 Tasks 的原生历史资格'
pnpm exec vitest run apps/engine/test/task-dispatch.live.test.ts -t 'Tasks production dispatch keeps providers without acceptance evidence unsupported'
HUHU_CODEX_DISPATCH_BIN="$PWD/temp/issue-evidence/huhu-2026-11-22/fixtures/codex-0.170.0/codex" pnpm exec playwright test tests/e2e/workflows/task-journey.spec.ts -g 'C01 任务编辑器直接恢复所选的 Codex 持久历史并完成原生问答'
```

### Modern Web Guidance

- **`accessibility`**：我沿用选择器和预览结果里的可见文本呈现占用状态。指南写道 “If content is important, it should be visible for everyone.” 检索与读取使用本机缓存。
