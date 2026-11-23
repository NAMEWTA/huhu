# Mail 分栏保存生命周期修复

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- 任务身份 — `t1f9/task01.md`，Lead `t3p`，本机默认 Herdr Core，`HC_TERMINAL_ID=t1f9`
- 实际报告 — `/home/wta/projects/huhu/temp/closeout-release/t1f9-report01.md`
- 执行结果 — `done`，实施和单文件回归完成，桌面 E2E 交由 Lead
- 工作树 — `/home/wta/projects/huhu`，`main@cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`，未提交工作树改动

## 改动

- Mail 在切换或关闭 Vault、离开模块前等待该 Vault 的分栏保存。模块离场守卫先检查草稿，再排空分栏保存。窗口退出保留最终 flusher 检查并向宿主报告失败。等待期间补入的提交也会被排空。 [MailModule.tsx](/home/wta/projects/huhu/plugins/mail/src/ui/MailModule.tsx:137) · [MailComposer.tsx](/home/wta/projects/huhu/plugins/mail/src/ui/MailComposer.tsx:319)
- 分栏调整等待已有 `vault.info` 查询。有写入权限时通过原有 Vault mutation scope 逐笔写入，已确认只读时仅调整当前显示。最新保存失败会保留目标宽度，显示「重试保存分栏」按钮，并使离场检查返回失败。重试发送同样的字段和值。 [useMailPaneWidths.ts](/home/wta/projects/huhu/plugins/mail/src/ui/useMailPaneWidths.ts:31)
- 保存成功后先取消该 Vault 精确键上的在途 `settings.get`，再更新已确认的字段。挂载时沿用工作台查询缓存读取已保存宽度。 [useMailPaneWidths.ts](/home/wta/projects/huhu/plugins/mail/src/ui/useMailPaneWidths.ts:20)
- 本次工作范围为 Mail UI、Mail 单文件回归和 Mail E2E。两项已修引擎缺陷沿用 Lead 前序验收。

## 验证

- `pnpm exec vitest run plugins/mail/test/pane-save.test.tsx`。用实际 Mail 组件、Workbench UI store 和 QueryClient，在能力请求边界挂起或拒绝响应。修复前四项按预期失败，分别观察到零次写入、队列未完成即离场、失败后离场放行、重挂载显示 260。修复后 4/4 通过。 [测试](/home/wta/projects/huhu/plugins/mail/test/pane-save.test.tsx:110) · [修复前日志](/home/wta/projects/huhu/temp/closeout-release/t1f9-pane-red.log) · [修复后日志](/home/wta/projects/huhu/temp/closeout-release/t1f9-pane-green.log)
- `git diff --check -- plugins/mail tests/e2e/workflows/mail.spec.ts` 通过。
- 实际文件 blob（依次为 `MailModule.tsx`、`MailComposer.tsx`、`useMailPaneWidths.ts`、`pane-save.test.tsx`、`mail.spec.ts`）为 `deea17112a621cfbea56a87cc457f46985950a1b`、`54c14a69354b7e525c535b3518c056970479aa85`、`e92ccf026c02c393be1ad8e941854b35ae6436db`、`b6d1990cd34f4b406fd85c80a2f0872435cbd9c6`、`c9c08cf9ad274ae91e220ce54418220b4dc38686`。

## 未运行的验证

- Electron、Playwright 和浏览器未运行。Lead 串行执行 `tests/e2e/workflows/mail.spec.ts` 新增两例「邮件分栏等待写权限，离开模块等两笔保存且迟到设置读取不覆盖宽度」和「邮件分栏写入失败保留原值供重试，关闭 Vault 等重试和下一笔保存」。草稿与分栏共享离场守卫，现有「邮件草稿保存失败时保留工作区，重试后可切换并继续编辑原草稿」同样由 Lead 复核。 [延迟用例](/home/wta/projects/huhu/tests/e2e/workflows/mail.spec.ts:776) · [失败和关闭用例](/home/wta/projects/huhu/tests/e2e/workflows/mail.spec.ts:853) · [草稿用例](/home/wta/projects/huhu/tests/e2e/workflows/mail.spec.ts:970)
- 构建、打包、全仓类型检查和全量测试未运行。

### Modern Web Guidance

- **`js`** 我在回归测试中用 `Promise.withResolvers()` 从测试步骤控制权限、设置读取和写入的应答时序（“when a promise's resolve and reject callbacks must be stored or invoked outside the new Promise executor scope”）。

## Lead 验收

由 Lead 追加。

Lead 已收取备用报告，待类型、真实UI及草稿离场复验。

## Lead 实际验收
Mail 定向类型检查 t1fj、desktop 与 E2E 类型/构建 t1fm 通过；t1fn 三个实际 Electron E2E 全过、零跳过。日志 temp/closeout-release/mail-lifecycle-ui.log 与 result.json。三项时序发现已核对关闭，保留全量发布门禁待最终执行。
