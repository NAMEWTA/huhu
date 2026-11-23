# Mail 最终独立复审

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- 身份 — `t1f3/task01.md`，Lead `t3p`，本机默认 Core，`HC_TERMINAL_ID=t1f3`，manifest 当前指针为 `active`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1f3/task01.md`
- 约定报告 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1f3/report01.md`
- 实际报告 — `/home/wta/projects/huhu/temp/closeout-release/t1f3-report01.md`，按任务指定的只读挂载备用路径发布
- 执行结果 — `done`，独立复审完成，分栏持久化仍有发现
- 审查基准 — `fc43ceef5b64ca1c9a68404c9110a6ca46883034`。实际审查 `/home/wta/projects/huhu` 的 `main@cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2` 及范围内工作树改动，包括三个未跟踪的 Mail 源文件。范围是 `packages/contracts/src/settings.ts`、`plugins/mail`、`tests/e2e/workflows/mail.spec.ts`。复审时 `MailModule.tsx` Git blob 为 `93bed719193e388a0c63ad1e31707fb096d1eaeb`。

## 规格轴

前审的两项引擎缺陷已关闭。正常写入、同 Vault 重开和不同 Vault 的设置隔离有引擎证据，窗口缩放只改变显示宽度。分栏写入与关闭的时序仍有以下缺口。

1. **P2 · 切换或关闭 Vault 时可以丢掉已提交到界面的分栏宽度。** 连续调整两栏，让首笔设置请求的响应延迟，第二笔还在同 Vault 的 mutation scope 排队。此时确认切换或关闭 Vault，桌面路径检查离场参与者及脏文档，再调用宿主停止旧 Engine。Mail 宽度只登记窗口退出 flusher。旧 Engine 关闭开始后拒绝写能力，队列中尚未发出的设置可能收到 `ENGINE_CLOSING`，也可能连接已关闭。离开 Mail 模块会卸载组件并移除该 flusher，因此随后退出窗口也有同样的排队缺口。探针确认第二笔在第一笔应答前未进入写函数。宿主调用链确认 Vault 切换不等这条队列。E2E 现有用例先轮询两项落盘才关闭，覆盖正常重开。 [Mail 写入队列与 flusher](../../plugins/mail/src/ui/MailModule.tsx#L138) · [模块卸载](../../packages/workbench/src/shell/AppShell.tsx#L330) · [Vault 切换前检查](../../packages/workbench/src/shell/AppShell.tsx#L84) · [Vault 切换和关闭](../../packages/workbench/src/shell/VaultSwitchDialog.tsx#L38) · [旧 Engine 停止](../../apps/desktop/src/main/index.ts#L332) · [关闭时拒绝写入](../../packages/kernel/src/dispatcher.ts#L291) · [正常重开用例](../../tests/e2e/workflows/mail.spec.ts#L735)
2. **P2 · 可写 Vault 的首次调整可能被静默当作临时调整，明确失败后也缺少同值重试。** 邮箱列表先于 `vault.info` 返回时，分隔条已可操作，`readOnly` 因权限尚未知而为真。实际 `resizePane` 探针从 260 调到 320，界面保存了本地显示值，确认可写后累计写入仍为 0。已确认可写时，在持久 440 后令保存 420 拒绝，实际回调显示错误，但本地显示仍为 420，flusher 收到 fulfilled。分隔条会跳过相同显示值，因此维持目标 420 无法自然重试，重开读到 440。这里应覆盖可写状态尚未返回、失败后重试同一目标和退出时失败传递。 [权限与写入](../../plugins/mail/src/ui/MailModule.tsx#L172) · [本地宽度优先](../../plugins/mail/src/ui/MailModule.tsx#L123) · [错误回调](../../plugins/mail/src/ui/MailModule.tsx#L139) · [显示分隔条的条件](../../plugins/mail/src/ui/MailModule.tsx#L498) · [相同宽度的事件条件](../../plugins/mail/src/ui/MailPaneSeparator.tsx#L59)
3. **P3 · 迟到的旧设置响应会让重进 Mail 短暂恢复旧宽度。** 用项目实际安装的 TanStack Query 与当前成功回调，将旧 `settings.get` 响应挂起，成功提交两栏为 440/360，再让旧 GET 返回 260/208。缓存最终回到 260/208。当前挂载由本地值遮住旧数据，重挂载在五秒新鲜期内会直接读旧缓存。引擎持久状态仍为 440/360。触发需要慢读与写入交错。 [设置成功回调](../../plugins/mail/src/ui/MailModule.tsx#L139) · [设置共享查询及缓存时长](../../packages/workbench/src/engine-client/react.tsx#L50) · [本地宽度优先](../../plugins/mail/src/ui/MailModule.tsx#L123)

## 规范轴

- **副本选择。** 对话稳定排序取首位，账号摘要顺序遍历并仅由更优者替换。两者共用身份、目录优先级、日期、来源、IMAP UID、稳定 ID 及旧缓存邮件头回退。相同排序键保留同一遍历顺序的首项。本机已发候选 rank 为 3，优先级低于所有邮箱缓存副本，属于纯已发的条目也不贡献未读。对话之后按公开参与者和时间范围过滤。当前账号摘要是全时段邮箱计数。Lead 实际单文件涵盖两种目录顺序和两种相反读态。 [共享规则](../../plugins/mail/src/engine/mail-copies.ts#L8) · [对话归并](../../plugins/mail/src/engine/conversations.ts#L73) · [已发候选](../../plugins/mail/src/engine/conversations.ts#L225) · [账号摘要归并](../../plugins/mail/src/engine/message-cache.ts#L288) · [回归用例](../../plugins/mail/test/messages-engine.test.ts#L265)
- **坏缓存隔离。** 摘要为工作台显式可选项。文件路径仍走 Vault 守卫，访问异常和坏 JSON 均使该账号 `mailbox: null`。账号、认证与其余账号摘要保留，对应账号行显示未知未读数，异常账号管理入口沿用账号可用与可写条件。夹具覆盖真实路径守卫、健康账号对话、异常账号改名及重建恢复。直接读取拒绝坏路径。全账号对话仍沿用现有缓存读取规则，遇到同一路径守卫错误会中止，健康账号可单独进入。 [能力注册](../../plugins/mail/src/engine/registration.ts#L81) · [投影隔离](../../plugins/mail/src/engine/message-cache.ts#L268) · [账号行状态](../../plugins/mail/src/ui/MailModule.tsx#L529) · [已有全账号对话读取路径](../../plugins/mail/src/engine/conversations.ts#L193) · [隔离用例](../../plugins/mail/test/messages-engine.test.ts#L278)
- **设置与尺寸。** 每次写单字段。Engine 在同一次同步处理器调用中读当前 Vault 设置、深合并并原子改名。探针实测同 Vault scope 两笔依次进入。同 Vault 重开从其设置文件读取，另一 Vault 有独立文件、query client 和组件 key。无指针键盘输入时，宽度观察器只测量可用空间，窄屏容器规则只隐藏分隔条或改变布局。纯函数探针复核了宽 → 窄 → 宽，账号显示 440 → 416 → 440，联系人显示 360 → 160 → 360。 [设置 schema 和合并](../../packages/contracts/src/settings.ts#L53) · [设置文件归属](../../apps/engine/src/boot.ts#L259) · [设置写处理器](../../packages/kernel/src/capabilities/system.ts#L588) · [Vault 组件 key](../../plugins/mail/src/ui/MailModule.tsx#L96) · [容器裁剪](../../plugins/mail/src/ui/MailPaneSeparator.tsx#L8) · [响应式样式](../../plugins/mail/src/ui/mail.css#L466)

## 验证与范围

| 项目 | 证据 |
| --- | --- |
| Lead 单文件真实网络 | `pnpm exec vitest run plugins/mail/test/messages-engine.test.ts` 对应日志为 1 文件 5 通过，包括双账号真实回环 IMAP/HTTP、两项副本顺序、坏缓存和设置重开归属。 [Lead 日志](mail-reviewed-unit.log) |
| 本轮只读运行探针 | Node 26 从当前源文件取出 `resizePane`、`onSuccess/onError`、显示宽度表达式和 `useMailColumn`，使用工作台实际依赖的 QueryClient/MutationObserver 5.107.1 和可控制的 Promise，得到上述队列、迟到读取、失败、初始权限及裁剪结果。模块挂载与宿主关闭顺序由调用链核对。 |
| 差异与规格 | `git diff --check fc43ceef -- packages/contracts/src/settings.ts plugins/mail tests/e2e/workflows/mail.spec.ts` 通过。审阅了先前两份报告、M-01/M-02、原始需求 §5.4 和原型确认记录。 [规格](../../.agents/dev/changes/2026-11-19-issue-8-mail-module/spec.md#L20) · [分栏持久化要求](../../.agents/dev/changes/2026-11-19-issue-8-mail-module/source.md#L239) · [原型确认](../../.agents/dev/changes/2026-11-19-issue-8-mail-module/prototype-review.md) |
| 未运行的验证 | 本轮独审未运行 Electron/Playwright、浏览器、构建、打包、类型检查及全量套件。真实桌面和 Web 正常保存/重开、故障时序和实际焦点仍由 Lead 验收。当前 Lead 的桌面类型日志报出其他模块 `TaskEditor.tsx:353`，该文件在本次审查范围外。 [Lead 类型日志](mail-reviewed-desktop-types.log) |

### Modern Web Guidance

我用本地缓存的 CLI 搜索并读取了 `drag` 和 `accessibility`，核对了专用分隔条、指针捕获清理、键盘调整和布局裁剪。本轮为只读复审。

## Lead 验收

由 Lead 后续追加。

Lead 收取备用报告，已取消仅发送报告路径的权限提示。三项分栏时序缺口需返工；引擎两项修复已确认。
