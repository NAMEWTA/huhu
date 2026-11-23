# Mail 独审三项修复

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- 终端与任务 — `t1dv/task01.md`，Lead `t3p`
- 任务 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1dv/task01.md`
- 约定报告 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1dv/report01.md`
- 工作树 — `/home/wta/projects/huhu`，`main`，`HEAD=cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`，代码在共享工作树
- 执行结果 — `done`，实现和定向回归已完成，桌面联验交给 Lead

## 交付

1. 账号未读投影与对话列表共用邮件身份、目录优先级、日期及稳定排序。相同 Message-ID 在同账号内使用同一个胜出副本。旧缓存缺少公开元数据时，两处调用同一头部解析逻辑。摘要按文件 stat 指纹缓存排序字段与读态，不保留正文。[副本规则](/home/wta/projects/huhu/plugins/mail/src/engine/mail-copies.ts) · [账号投影](/home/wta/projects/huhu/plugins/mail/src/engine/message-cache.ts:249) · [对话归并](/home/wta/projects/huhu/plugins/mail/src/engine/conversations.ts:71)
2. 目录缓存越界、不可访问或损坏时，只有该账号的摘要返回 `mailbox: null`。账号定义、认证状态与管理入口仍可用，异常行显示未读数未知与同步状态错误。直接访问越界缓存仍返回 `PATH_OUTSIDE_VAULT`，健康账号可选且可单独阅读。汇总未读数在存在未知摘要时也显示未知。[账号能力](/home/wta/projects/huhu/plugins/mail/src/engine/registration.ts:32) · [账号行](/home/wta/projects/huhu/plugins/mail/src/ui/MailModule.tsx:67)
3. 两处分栏按 Vault 保存。共享 Settings schema 新增 `mail.accountWidth` 和 `mail.contactWidth`，通过既有 `settings.get/update` 读取与逐字段合并。键盘调整立即提交，拖动预览在松开后提交，取消拖动恢复原宽度。显示宽度受容器限制，只读时保留临时调整。退出前等待已发起的写入。[设置](/home/wta/projects/huhu/packages/contracts/src/settings.ts:8) · [工作区](/home/wta/projects/huhu/plugins/mail/src/ui/MailModule.tsx:139) · [分隔条](/home/wta/projects/huhu/plugins/mail/src/ui/MailPaneSeparator.tsx:28)

## 验证

- 红灯复现使用 Mail 注册的真实能力处理器、真实 Vault 文件和合成账号。普通目录按 Archive、Work 排列时，对话选择 Work，账号未读期望 0、实际 1。坏缓存的真实目录链接让基线 `mail.accounts.list` 抛出越界错误；已先核对 `VaultFiles.abs` 和直接邮件读取均返回 `PATH_OUTSIDE_VAULT`。[红灯日志](/home/wta/projects/huhu/temp/closeout-release/t1dv-mail-red.log)
- 设置能力红灯复现中，`settings.update` 仍保存既有外观选项，重读结果缺少请求写入的 `mail` 字段。[设置红灯日志](/home/wta/projects/huhu/temp/closeout-release/t1dv-mail-settings-red.log)
- `pnpm exec vitest run plugins/mail/test/messages-engine.test.ts -t '普通目录副本|一号邮箱的缓存|邮件分栏经过' --reporter=verbose` 得到 4 通过、1 过滤。包括两个目录顺序与两种相反读态、旧公开元数据回退、真实路径守卫、健康账号对话、异常账号改名、缓存损坏后重建、同 Vault 重新读取和另一 Vault 默认值。[通过日志](/home/wta/projects/huhu/temp/closeout-release/t1dv-mail-green.log) · [回归代码](/home/wta/projects/huhu/plugins/mail/test/messages-engine.test.ts:265)
- 定向 11 文件 `oxfmt --check` 和相关路径 `git diff --check` 通过。

## 未运行的验证与 Lead 接续

尝试过原定单文件命令，沙箱拒绝 IMAP 回环监听，报 `listen EPERM: operation not permitted 127.0.0.1`。随后用无需网络的注册能力夹具完成四项定向验证。原有跨账号 UID 的 HTTP/IMAP 用例仍需 Lead 在允许回环的环境复跑。新增 E2E 已写入，桌面与 Web 真实 UI、类型检查、构建、打包及全仓验证由 Lead 执行。下面命令可在项目根依次执行。

```sh
pnpm exec vitest run plugins/mail/test/messages-engine.test.ts
pnpm exec tsc -p apps/desktop/tsconfig.json --noEmit
pnpm exec tsc -p temp/closeout-release/tsconfig-ui.json --noEmit
pnpm --filter @huhu/desktop run build
pnpm exec playwright test tests/e2e/workflows/mail.spec.ts -g '缓存越界时仍显示两个邮箱|邮件两处分栏随 Vault 重开恢复|邮箱账号行独立刷新与管理两个账号' --workers=1 --retries=0
```

Linux 桌面 E2E 沿用 Lead 上一轮的显示环境。缓存故障和分栏重开分别有独立用例。共享 UI 的浏览器入口沿用 Engine 客户端，仍需 Lead 在已授权的可写 Web 会话实测两处设置的写入与重开。[缓存 E2E](/home/wta/projects/huhu/tests/e2e/workflows/mail.spec.ts:653) · [分栏 E2E](/home/wta/projects/huhu/tests/e2e/workflows/mail.spec.ts:698)

## Modern Web Guidance

- `drag`。我将拖动中的分栏宽度留作预览，松开时提交，并沿用指针捕获和丢失捕获后的清理。依据 “commit the final position … on release” 和 “clear the dragging state on `lostpointercapture`”。

## Lead 验收

Lead 收取备用路径完整报告：worker 沙箱对 .agents 只读，未接受权限提示。当前接受实施交接，真实 UI、类型检查及独审仍待核对。
