# Mail 工作台原批次续跑

- worker `t86`，Lead `t3p`。实现基于 `dbe58665` 的 Mail 批次绑定，验证时 integration HEAD 为 `af3d500c`。四个候选文件未提交，发布后冻结。 [任务](task06.md) · [独审](../t9b/report01.md) · [S6b.1 验收](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S6b.1-subset-restore.md)

## 实现

- 同一份 ZIP 重新预检后，若同时有已恢复和可选的待恢复邮箱，原对话框显示默认未勾选的「按原批次续跑」。用户重选全部原邮箱，包括已恢复项，并单独重选原来保留为独立账号的邮箱。继续使用原生复选框、标签、帮助描述和现有确认提交流程。预检仍将焦点移至结果标题。勾选模式只改变可选项与提交文案。 [工作台](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/ui/MailSubsetSettings.tsx:189)
- 既有日志只保存原批次摘要。本轮选择让用户明确重选，以复用已落盘的摘要并覆盖升级前已中断的批次。Mail 的现有恢复请求接受可选的 `resumeOriginalBatch: true`。Engine 在原锁内按当前预检主体、ZIP 原始字节、排序后的全量账号和独立账号选项重算摘要。只有同一原批次至少一个已恢复成员仍能核对时才续跑，之后继续执行现有冲突校验。入参不匹配直接拒绝。已完成账号继续跳过，恢复普通 B 时使用原 ID 并保留无定位的本地已读标记。原来显式独立恢复的 B 仍使用独立 ID。 [提交复核](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:475)
- 确认原两项后端结论依旧成立。单独恢复 A 后另选同地址 B，仍须按普通恢复显式确认独立账号。原批次已显式勾选两个独立账号时，遗漏其中一项会拒绝；带原完整参数重开只补 B，保留既有账号和已恢复 A 的密码与修订。换 ZIP、主体或勾选，或后来新增同地址账号，均有拒绝用例。 [能力回归](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:495)

## 验证

- `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Mail (备份内|子集|同地址子集)'` 为 **9 通过、11 跳过**。测试含真实 Engine 恢复逻辑、逐账号受控写失败、关闭后重开、确认记录漏写、原 ID 与标记核对。日志 `/tmp/huhu-t86-task06-mail-subset.log`。
- 同文件首次未过滤执行，9 通过、11 失败。11 项都在启动回环监听时收到 `listen EPERM 127.0.0.1`，未重试回环环境。日志 `/tmp/huhu-t86-task06-mail.log`。四文件 `oxfmt --check` 与 `git diff --check` 通过。
- 前端指南在线请求遇到 DNS `EAI_AGAIN`，随后通过现有 npm 缓存离线执行两次 `search` 和一次 `retrieve forms,checkbox,accessibility`。按指南使用原生复选框、关联可见标签与帮助文本、保持显式提交和已有结果标题焦点。无新浏览器 API。

## 未运行的验证

- 桌面用例「工作台重开后续跑同地址 Mail 原批次并保留未完成邮箱的已读标记」已编写。它用第二账号的已读记录路径冲突制造首次部分成功，刷新工作台并重读原 ZIP，实测选择错误被拒和正确续跑后的原 ID、旧账号状态及标记。候选未执行该 Playwright 用例。 [E2E](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/workflows/mail.spec.ts:24)
- Mail 和 E2E 定向类型检查、浏览器工作台验证、回环相关测试、全仓门禁、打包均待 Lead。Agent、Automations、native、SSH、公共契约包及根配置保持原样。

## Lead定向检查
66667d9f保存实现，6dcffca2修正同E2E文件两个已有可选值类型；t9p Mail模块types通过，t9q E2E定向types和完整outbox20/20通过。GUI/最终包未跑，t9b/task03复核调用方。
