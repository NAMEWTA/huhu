# Mail 账号行与分栏执行报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- terminal_address — `t1d5`
- Lead — `t3p`
- task — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d5/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d5/report02.md`
- 执行结果 — `done`
- 工作树 — `/home/wta/projects/huhu`，`main`，起点 `fc43ceef`，报告时 `HEAD=cc551778`，Mail 实现为工作树改动。任务笔记订正已被 Lead 的文档提交接收。

## 交付

- 订正任务笔记。schema 能保存原生历史目标，`fc43ceef` 的派遣对该目标仍返回 `unsupported`。[任务与自动化](../../../../dev/notes/context/tasks-and-automations.md)
- 账号行显示账号图标、未读、同步中、已同步、首次等待、手动异常、计划重试和凭据异常。桌面悬停或键盘焦点可以触达同一个刷新按钮，触屏直接显示操作。账号级刷新使用该行绑定的账号 ID 和已配置目录。右键、Shift+F10 或行操作按钮打开菜单，复用现有修复、改名、删除与影响预览。关闭菜单或弹窗后恢复触发处焦点，已移除账号回到可用入口。[账号行](../../../../../plugins/mail/src/ui/MailAccountRow.tsx) · [工作区](../../../../../plugins/mail/src/ui/MailModule.tsx)
- 工作台按需请求账号未读投影。计数来自每个账号本机可见目录的缓存，排除删除记录及已读记录，重复邮件优先用 Inbox 副本，读取和标读原有缓存路径。身份与缓存版本计算按账号隔离，文件未变化时重用轻量投影，避免轮询重复解析正文缓存。首次同步、手动同步和同步计划状态复用现役能力。Graph 到达与通知分类代码未改。[账号合同](../../../../../plugins/mail/src/engine/registration.ts) · [缓存摘要](../../../../../plugins/mail/src/engine/message-cache.ts)
- 宽屏可拖动账号与内容、联系人与阅读两处分隔条。键盘可用左右键及 Home/End，约束会给阅读内容留出空间。最小账号栏为 220px，联系人栏为 160px。宽度留在当前 Mail 工作区，跟随视口暂时约束，账号切换及窄屏返回继续复用已选布局与焦点逻辑。[分隔条](../../../../../plugins/mail/src/ui/MailPaneSeparator.tsx) · [布局样式](../../../../../plugins/mail/src/ui/mail.css)
- 新增双账号桌面 E2E。夹具验证第二个账号刷新和管理时仍选中第一个邮箱，检查同步中、右键修复目标及取消焦点、键盘改名与删除目标、两处分隔条实际宽度、窄屏正文和账号返回。同时将既有 Web 夹具的资产入口切至 `out/web`，与 t1d8 交接一致。[Mail E2E](../../../../../tests/e2e/workflows/mail.spec.ts)

依据已读的 t1d4 独审 #8、S1a.3 与确认原型。项目复用 `@huhu/ui` 的 Popover、Button、IconButton 和账号管理弹窗，分隔条沿用 Agent Workspace 的焦点、指针捕获与键盘模式。one-mail 同版本参考了独立的账号选择按钮、刷新按钮、未读与状态以及右键入口。当前 checkout 的 `temp/sources` 没有 one-mail，本次通过固定上游源码读取参考。[独审](../t1d4/report01.md) · [S1a.3](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S1a.3-manage-accounts.md) · [原型确认](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/prototype-review.md) · [one-mail 固定版本](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/account/account-list.tsx)

## 验证

- `./node_modules/.bin/vitest run plugins/mail/test/messages-engine.test.ts` 最终一次 1 文件、1 项通过。该用例在同一个运行引擎预热账号投影后将一号邮箱标为本机已读，检查一号计数从 1 变 0，二号仍为 1，并继续覆盖两账号相同 UID 与 UIDVALIDITY 换代。[回归测试](../../../../../plugins/mail/test/messages-engine.test.ts)
- 10 个改动代码、CSS 和测试文件的定向 oxfmt check 通过，`git diff --check` 通过。
- Lead 的早期 desktop 定向 tsc 分别指出遗漏导入与 `current` 可空。已补 `mailFolderRole` 导入，并在读取 `current.source` 前加显式判空，已请 Lead 复跑。两次中间态结果均不计为通过。

## 未运行的验证与 Lead 接续

- 本 worker 未启动 Electron、Playwright、构建或打包，也未运行全仓测试、类型检查、lint 或视觉截图。实际动作按钮、分栏拖动、窄屏布局仍待 Lead 用真实应用验证。
- 建议先核对 `apps/desktop/tsconfig.json`，再单进程执行 `pnpm exec playwright test tests/e2e/workflows/mail.spec.ts -g '邮箱账号行独立刷新与管理两个账号' --workers=1 --retries=0`。回归范围可补同文件的「工作台…时取消正在等待 Graph 的手动同步」，覆盖目录按钮既有的离开取消与新的账号级状态共存。含浏览器的既有用例须使用独立 Web 制品 `apps/desktop/out/web`。
- 线上邮箱提供商及其他平台沿用原验证边界。未移动 change、关闭 Issue、创建 worktree、提交或推送。

## Modern Web Guidance

- `menu`。我用现役 Popover 管理容器边界和关闭，菜单项用方向键导航，Escape 回焦原入口。依据 “Escape in a top-level menu. Closes it and restores focus to its trigger.”
- `accessibility`。我保留原生按钮并拆开选择和刷新，未读与状态自描述，键盘可以进入同一个按钮。依据 “Prefer HTML elements and attributes to ARIA”.
- `drag`。我用专门分隔条捕获指针，把调整范围同时用于指针与键盘。分隔条语义和 aria-controls 对照 W3C 窗口分隔条模式。依据 “Default to setPointerCapture() and clear the dragging state on lostpointercapture.” [W3C Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)
- `responsive-design`。我保留现役容器断点，分隔条仅在可调整布局内显示，窄窗继续逐层返回。依据 “adapt to their parent container's size rather than the viewport.”

## Lead 验收

Lead 已核对 Mail 账号绑定、缓存投影和分隔条实现，定向 desktop tsc t1dj 通过。接受本次实施交付进入独立审查与真实 UI 验证，未将 E2E 记为通过。
