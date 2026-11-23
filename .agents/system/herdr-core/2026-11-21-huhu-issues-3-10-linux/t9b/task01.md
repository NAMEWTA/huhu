# Mail 恢复批次定向独立复核
Lead t3p；worker wta-ubuntu/t9b。共享根为本文件上两级，工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration。
使用 dev-review，读取 topic、manifest 与 AGENTS。只读业务代码，不启动其他代理。
固定目标 dbe58665，基准 dbe58665^，仅复核 t93/report01.md 中第1/3项是否修复及此次修复的直接回归；不要重新开展全模块审计。当前工作树 Agent/Automations 为其他 worker 所有，完全排除。
契约：Mail 同地址独立恢复、新格式子集恢复可重试；主体/ZIP/完整账号与keepSeparate选择改变后，不得继承另一批次豁免；原明确确认A+B独立恢复到已有同地址E，中断后原参数重交应返回原A并补B且不改E/A认证。未发布旧开发候选日志迁移不在范围。
输入：plugins/mail/src/engine/subset-data.ts 与 test/outbox-engine.test.ts；t86/report04.md；.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/spec.md。Lead t99 完整20/20与模块类型通过，日志 /home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/mail-batch-recheck.log。
仅在需要证实疑问时运行这个单Vitest文件中的定向用例。不得修改业务/测试，不跑E2E/全量门禁/构建。发现必须有具体输入、预期实际和代码证据；区分推测。分别给规格/规范结论、前两项关闭情况及未验证范围。报告写本目录report01.md，不覆盖已有；完成向t3p回报后等待。