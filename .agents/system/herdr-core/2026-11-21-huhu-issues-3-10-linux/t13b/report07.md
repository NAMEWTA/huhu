# 在途写入自动入口回归已就绪

Lead `t3p`，worker `t13b`，工作目录 `agent-linux`。本轮只新增两条单测和一条双文档桌面 E2E，原 65 项用例保留。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task07.md) · [独审报告](t14j-report01.md)

| 用例 | 验收行为 | 预期红灯 |
| --- | --- | --- |
| 保存落盘后对账尚未返回，外部通知不能自动重载覆盖撤销正文 | 确认 A 已实际写入，撤销回 X，注入落盘后的错误并扣住对账读数。直接调用会话的 `notifyExternalChange("modified")` 自动入口。对账返回前后缓冲继续是 X，原请求只写一次，退出以对账版本留下 X 草稿。[document-session.test.ts](../../plugins/notes/test/document-session.test.ts#L828) | 自动入口发起新重载并接纳 A。旧对账完成后退出没有 X 可留。 |
| 撤销回旧磁盘正文后，回执或对账待定期间都参加切 Vault 留稿 | 同一次保存先扣回执，再令其失败并扣住对账读数。两阶段的 `hasUnsaved` 均为真，这是实际 Vault 切换参与者使用的判定。对账在途时调用 `keepDraft()`，放行后必须实际留 X 草稿，磁盘仍是 A。[document-session.test.ts](../../plugins/notes/test/document-session.test.ts#L1102) | 两个待定阶段均错误报告 `hasUnsaved: false`。直接调用留稿仍能写成，故该断言区分了筛选漏选与入队后留稿失败。 |
| C06 两篇笔记切 Vault 时，回执待定且已撤销的笔记也保留草稿 | 普通脏稿停放的写入先扣住，当前笔记的 A 由真实 Engine 落盘后扣住回执，再撤销为 X。真实切换对话框应列出两篇。普通脏稿的第二个草稿请求到达时，本轮参与者筛选已经完成，随后才放行首篇保存回执。切回原 Vault 后读取两篇草稿并从编辑器恢复 X，正文磁盘仍为 A。[session-flush.spec.ts](../../tests/e2e/knowledge/session-flush.spec.ts#L775) | 待定笔记没有出现在列表，切回时也读不到它的 X 草稿，普通脏稿仍可回读。 |

## 未运行的验证

按任务分工，本轮未运行 Vitest、类型检查、构建或 Playwright/Electron E2E。实际红灯由 Lead 验证。生产代码未改。
