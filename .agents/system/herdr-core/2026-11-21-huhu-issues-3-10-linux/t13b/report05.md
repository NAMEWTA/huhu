# 保存对账三项独审回归已就绪

Lead `t3p`，worker `t13b`。已新增两条门控单测和一条桌面 E2E。生产代码未改。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task05.md) · [独审报告](t147-report01.md)

| 用例 | 验收行为 | 预计修改前的失败 |
| --- | --- | --- |
| 切 Vault 的留稿跨对账切代时仍写入当前正文，写失败会拒绝切换 | 拦住旧保存，重载同版本后输入 B，把 `keepDraft()` 排在旧请求之后。对账切代后留稿必须发出，写失败须拒绝切换。解除注入故障后重试，草稿须包含 B 和对账版本，正文磁盘仍为 A。[document-session.test.ts](../../plugins/notes/test/document-session.test.ts#L1008) | 旧代数的草稿工作退出，`keepDraft()` 返回成功，调用未到达草稿写入故障。 |
| 同基线保存落盘后回执失败，尚未接纳的重载读数不能造成假干净 | 扣住保存写入，等重载采样 X 后扣住重载响应。放行保存，确认 A 已落盘，再拒绝保存回执并释放旧读取样本。会话必须复读，保留 X 并拒绝把文档结算为干净，退出须用新版本留 X 草稿。正文本次只写一次。[document-session.test.ts](../../plugins/notes/test/document-session.test.ts#L1096) | 旧重载返回后接纳 X，未复读磁盘，恢复 `saved/hasUnsaved=false`，排空误成功且退出无草稿。 |
| C06 对账无法读取且缓冲等于原文时，笔记仍可保留修改并确认重载 | 在临时 Vault 用同字节外部写触发重载。放行旧真实保存并只让对账读取失败，等待真实冲突状态后恢复读取。应显示「保留我的修改」，重载先确认，取消后缓冲保留。选择保留并明确保存，才把原正文写回磁盘。[session-flush.spec.ts](../../tests/e2e/knowledge/session-flush.spec.ts#L149) | 「保留我的修改」隐藏，点击「载入最新版本」直接替换缓冲，无「放弃我的修改并载入」确认动作。 |

## 未运行的验证

按任务分工，本轮未运行 Vitest、类型检查、构建或 Playwright/Electron E2E。上述失败是预期，实际红灯由 Lead 验证。
