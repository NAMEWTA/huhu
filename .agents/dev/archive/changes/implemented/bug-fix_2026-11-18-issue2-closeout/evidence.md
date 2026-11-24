# Issue #2 交付验收

归档于 2026-11-24。原目录为 `.agents/dev/changes/2026-11-18-issue2-closeout`，主类型为 bug-fix。本次归档按用户确认的已交付范围收口。
GitHub Issue 已按 completed 关闭。早期候选 `ce913d2` 经 `f16f614` 合入。复审发现的改名、编码和撤销阻断由 `38cc28f` 合入，剩余实现由 `57a9f8b` 经 `e58586c6` 合入。 [Issue #2 最终范围与验证](https://github.com/NAMEWTA/huhu/issues/2#issuecomment-7038851587)

| 候选 | 已记录的验证 |
| --- | --- |
| `ce913d2` | 全量 E2E 244 通过、0 失败、4 跳过。关单后又补了代码，该数据适用于当时的候选。 [历史逐项台账](acceptance.md) |
| `d6a4663` | 记录 H02、B06、G07 当时的结论及正文延迟回退。 [重开阶段的验证](verification/reopened/README.md) |
| `57a9f8b` | 13 项门禁退出 0。全量 E2E 293 通过、22 失败、7 跳过。22 项未逐项分诊。 [合入说明](https://github.com/NAMEWTA/huhu/issues/2#issuecomment-7038851587) |

最后一轮的 OK 两端对拍、F09、G07、H05 成本、H02 视觉和打包未运行。Windows/macOS 实机、真实输入法和硬件鼠标按既有约定留待验证。本次归档沿用历史验证。

- [规格与范围](../feature_2026-11-14-knowledge-ok-parity/spec.md)
- [派遣原记录](../../../../../system/herdr/2026-11-18-issue2-closeout/topic.md)
- [上游固定来源与重放](../../../../../../docs/upstream/ledger.md)

关单评论的旧台账路径可在 [迁移前的固定提交](https://github.com/NAMEWTA/huhu/blob/7984bff4cda1a67e865f1a980d6899e934aaff19/.agents/dev/changes/2026-11-18-issue2-closeout/acceptance.md) 读取。
