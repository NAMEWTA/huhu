# 冻结候选 0c96c27b 只读复核

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task09.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task09.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report09.md`
- 固定候选 — `0c96c27b844a580178a4d6f24f1d6bb987eba4e7`
- 执行结果 — `done`

## 结论

按 report08 的五项原始步骤逐一复核，均已修正。扩展验证发现两项 P2 和一项 P3。Agent 在点击目标分栏前收到新版布局时仍会丢失原 viewer 和焦点。Mail 在原账号邮箱的 UIDVALIDITY 变化后仍显示失效的标题和摘要。SSH 中主机页先发起、工作区随后加入同一等待时，返回工作区前仍需手动关闭主机指纹弹窗。Agent 环境设置的实际保存、密文落盘和重启后回显已通过。 [前序五项](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report08.md) · [冻结 Windows 门禁](D:/Document/code/huhu/temp/issue-baseline/0c96c27b-windows-gates.log:469)

## 产物与改动

审查对象为冻结 Git 对象。确认该提交包含 SSH 修正 `a17b1c48` 和 Mail 修正 `2394440a`，以及本提交的 Agent 修正。独立复验从 `git archive` 解出的临时快照运行，复用现有依赖。假 SSH 和邮件服务只绑定回环端口。业务源码、集成构建目录、其他 worktree 和真实账号均未写入。报告及其发布用临时稿是本轮对共享主题的写入。

## 验证

| report08 原发现 | 冻结候选结果 | 证据 |
| --- | --- | --- |
| SSH 工作区发起的等待在主机页拦住返回 | 通过。Windows App 的 H4.2 离开工作区后返回，原指纹确认仍有效。Edge 中的同一组件也确认主机页未弹模态，返回后分栏继续保留原等待。 | [H4.2](D:/Document/code/huhu/temp/issue-baseline/0c96c27b-windows-gates.log:517) · [独立组件探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/ssh-trust-ui.log:12) |
| SSH 最后一个租用者关闭后，旧确认仍可生效 | 通过。Windows Engine 与假 SSH 的探针在关闭最后一个等待工作区后，用旧 `promptId` 确认得到 `applied: false`，认证调用数为零。两个工作区共享一个提示但分别获得自己的 shell。关掉其中一个保留另一个，重新连接也未改写已结束分栏的 session。 | [独立 Engine 探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/ssh-run-and-command.log:12) · [租约释放](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/ssh/src/engine/manager.ts:387) |
| Mail 移除账号后，缓存搜索继续显示旧摘要 | 通过。用 Edge、固定 Mail 组件和真实 Windows Engine 验证取消一个来源目录和删除账号。只有搜索弹窗时，取消目录即撤出旧结果。删除账号后，旧结果及已打开阅读侧栏都撤出，新搜索无命中。 | [来源撤销探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/mail-source-revocation.log:12) · [账号变更与重取](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/mail/src/ui/MailModule.tsx:103) |
| Mail 命令被离场守卫拒绝后，下次手动进入仍自动弹搜索 | 通过。用实际 Workbench store 让异步守卫拒绝，随后手动进入 Mail 时旧请求未执行。冻结 App 也通过了首页命令的正常跳转和焦点交接。 | [守卫拒绝探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/ssh-run-and-command.log:24) · [正常入口 E2E](D:/Document/code/huhu/temp/issue-baseline/0c96c27b-windows-gates.log:511) · [命令交接](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/mail/src/ui/mail-search-command.ts:4) |
| Agent 跨 Tab 移动保存返回冲突后，丢失原 viewer | 通过。固定组件收到保存端 `VERSION_CONFLICT` 后恢复源 Tab、原分栏以及实际 DOM 焦点，源终端 viewer 仍是同一 DOM 实例。冻结 App 的成功移动和关窗回执也通过。 | [保存冲突探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/agent-move-receipt.log:12) · [真实 App 移动与关窗](D:/Document/code/huhu/temp/issue-baseline/0c96c27b-windows-gates.log:484) |

### P2 · Agent 移动前收到新版布局时仍丢失源 viewer

在源分栏开始移动，切到目标 Tab，再交付另一个窗口写入的新版本布局。点击目标分栏时，`moveTo` 在版本预检查中清空 `moveSource` 并直接返回，遗漏保存失败分支的选中 Tab、分栏和焦点恢复。Edge 探针确认此路径没有发送保存，目标 Tab 仍选中，原 viewer 从 DOM 卸载。该探针以可控 Engine 回执驱动固定组件，记录的是 viewer 生命周期和焦点。 [预检查与保存失败分支](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/agent-cli/src/ui/AgentCliModule.tsx:368) · [两种冲突顺序的日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/agent-move-receipt.log:12) · [复验探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/agent-cli/test/t187-move-receipt.test.ts)

### P2 · Mail 邮箱缓存换代后，已打开搜索仍显示失效摘要

保持账号与目录配置原样并打开搜索，使用同账号 IMAP 夹具改变 UIDVALIDITY。真实 Engine 的 `mail.sync.refresh` 回传 `mailboxChanged: true`，新的引擎搜索已找不到旧邮件。已打开搜索仍展示旧标题和摘要，点击定位收到不可用后仍保留该项。搜索响应关联的 `sourceRevision` 由账号事件和账号定义版本构成，邮箱缓存换代没有进入该依赖。 [缓存换代回执](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/mail/src/engine/message-cache.ts:224) · [搜索来源版本](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/mail/src/ui/MailModule.tsx:283) · [实际 Engine 与组件复现](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/mail-source-revocation.log:18) · [复验探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/mail/test/t187-search-revocation.test.ts)

### P3 · SSH 主机页和工作区共享等待时，弹窗仍挡住返回

真实 Engine 探针从主机页先发起连接，再让工作区加入，两个使用者拿到同一 `promptId`。复用旧 attempt 时，工作区租约已计入，状态仍按主机发起标记。将该回执喂给固定 SSH 组件，确认从工作区切到主机页后，原生模态挡住返回工作区的点击。点「稍后核对」可以继续返回。单纯由工作区发起的路径通过。 [同一 attempt 复用](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/ssh/src/engine/manager.ts:177) · [等待状态](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/ssh/src/engine/manager.ts:368) · [Engine 租约探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/ssh-run-and-command.log:18) · [组件点击探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/ssh-trust-ui.log:15) · [复验探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/ssh/test/t187-trust-navigation.test.ts)

### Agent 环境设置与密文边界

冻结 Windows App 单独通过了桌面设置 E2E。独立探针再用实际设置组件向真实 Windows Engine 保存普通值和受保护的假值。普通值出现在可移植定义中，保存回执和本地凭据文件均无受保护明文，本地文件有加密封装。重启 Engine 后，普通值仍可见，受保护输入为空并显示配置状态，显式清除后变为「未配置」。候选自带的 Engine 用例也独立通过，覆盖 Web／CLI 权限、旧版本冲突、ZIP 仅带普通配置，以及在新 Vault 恢复后需要重新配置受保护值。受保护原生启动由 t17c 独立验证。 [冻结 Windows 设置 E2E](D:/Document/code/huhu/temp/issue-baseline/0c96c27b-profile-setting.log:13) · [实际写入、落盘、重启和清除](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/environment-ui.log:12) · [密文及导出用例](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/environment-encryption.log:12) · [实际保存探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/candidate/plugins/agent-cli/test/t187-environment-ui.test.ts)

### 门禁覆盖

冻结记录已通过 lint、typecheck、format、knip、build、Agent E2E 5 项、组合工作流 18 项、任务 E2E 7 项、桌面关窗 E2E 1 项，另有 Agent 环境设置桌面 E2E 1 项。临时快照独立通过 28 项已有定向测试及 1 项环境 Engine 用例，另以表中的运行探针验证各边界。截至发布时，全量单测日志仍在输出用例结果，尚无最终汇总。 [冻结门禁](D:/Document/code/huhu/temp/issue-baseline/0c96c27b-windows-gates.log:18) · [独立定向回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task09-994d5edc/focused-regression.log:23) · [全量单测记录](D:/Document/code/huhu/temp/issue-baseline/0c96c27b-windows-unit.log)

## 阻碍与接续

复核已完成。候选仍有上述两项 P2 和一项 P3。随后复验可直接沿三个证据中的探针重复触发对应分支。

## Lead 验收
