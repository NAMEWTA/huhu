# Promise 兼容修复

- Core `wta-ubuntu`，Lead `t3p`，worker `t86`。基线 `be992934`，接续 [report02.md](report02.md)。
- t94 的定向检查记录四处 TS2550。已将四处 `Promise.withResolvers` 替换为本地 `new Promise`，保留交付结果、晚到凭据测试的两个同步点，以及并发重投的前台回执和错误传递。 [t94 日志](../../../../../temp/issue-evidence/huhu-2026-11-22/native-recovery-types.log)
- 改动仅在 `plugins/agent-cli/src/engine/sessions.ts`、`plugins/agent-cli/test/sessions.test.ts` 和 `plugins/automations/src/engine/service.ts`。交付后冻结，交 Lead 定向 tsc。

## 验证与范围

- 三个文件的 `oxfmt --check` 与 `git diff --check` 通过。tsc 和运行测试等待 Lead 执行。
- 范围外还存在 `plugins/automations/test/service.test.ts:327` 的一处同类调用。Automations 自身的 tsconfig 仍使用 ES2023，后续检查该插件测试时可能遇到同类错误。
