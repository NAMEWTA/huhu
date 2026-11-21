# t17c · #8 S1a.3 邮箱切换与原账号认证修复

## 交付

本地提交 `44941ecd346f9aa452efcc0de13ad6fe84d2dae2`，父提交 `94dc30a5854375c26d23a3339f20decca980e407`，分支 `impl/huhu-issues-3-10-mail-confirmed-ui`。工作树干净，变更包含 `plugins/mail` 和对应 #8 证据。确认稿四个资源与确认提交 `7d17ffa6` 一致，记录的指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。 [回环证据、重跑方式和截图](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1a.3-account-repair.md)

- **切换邮箱。** 账号栏按现有 Mail 提供商预设分组，可折叠并通过键盘选择。账号、目录和正文仍由原有本地消息定位约束。390px 下可由邮箱进到列表与正文，逐层返回会恢复该层的按钮焦点和当前账号选择。账号认证与名称动作仅在可写的桌面账号详情提供。
- **修复原账号。** `mail.accounts.testConnection` 接收账号 ID 与打开时的 revision，由 Engine 读出原配置后测试新凭据。保存复用 `mail.accounts.save` 的一次连接会话和模块凭据 CAS，保持原 ID、地址、服务端配置和目录。用户取消或页面卸载会中止请求。提交前取消会使会话失效，版本冲突会提示重新打开当前账号。
- **仅更改名称。** 动态能力 `mail.accounts.rename` 按同一账号 ID 和 revision 保存名称，使用凭据事务的 `keep` 操作，继续使用原认证。
- **拒绝与存储错误。** IMAP 拒绝认证或原选择目录已不可用时，留在当前修复对话框。落盘失败后可使用同一有效测试会话重试。旧账号的同步或修复响应不会把当前工作台切回旧账号。

## 验证

使用 Windows、Node 24.21.0、固定 pnpm 12.10.1、Vitest 3.2.7 与 Edge 157.0.4341.60。仅使用隔离 Vault、合成凭据及项目已有本机 IMAP/SMTP 夹具。未使用真实账户、用户 Vault 或外部服务，也未启动 agent。

| 检查 | 观察 |
| --- | --- |
| Mail 回归 | 7 文件 37 项通过，其中 36 项常规 Mail 自动化，1 项 Edge 探针。最终文案调整后探针再单独通过。前两轮账号添加、阅读、草稿、投递和重试的回归继续通过。 |
| Engine HTTP | 两个独立 IMAP 夹具分别返回不同主题。错误认证保留旧绑定。测试后通过名称变更推进 revision，旧会话保存返回版本冲突。若测试入口直接使用旧 revision，回环命令数不增加。注入凭据定义发表失败后，旧 revision 与绑定可读；暂停一次保存并取消，解开暂停后依然是旧认证，原会话不能重新保存。有效会话最终为原 ID 保存新 revision，保留配置。两边同步与受保护凭据读取均独立。 |
| 界面 | 390px 实际操作两组邮箱、键盘打开、窄窗逐层返回、恢复焦点、认证拒绝与原账号修复。探针延迟已通过的 IMAP 测试回应，在取消并选中另一个邮箱后才释放，旧对话框未出现。替换认证、随后仅修改名称后，真实同步仍返回原邮箱主题。截图隐藏测试口令字段。 |
| 静态 | Mail TypeScript、改动文件 Oxlint、Stylelint、Oxfmt、项目 CSS 颜色/分层/类名/所有权/重复以及 `git diff --cached --check` 均通过。 |

在当前工作树根取 `$repo=$PWD.Path` 后，使用本地固定原生 Windows 版本 `$lockedPnpm` 运行。Edge 探针按证据链接临时放到 Mail 测试目录。

```powershell
& $lockedPnpm --dir $env:TEMP exec node "$repo/node_modules/vitest/vitest.mjs" run --root $repo --project '@huhu/plugin-mail' --maxWorkers=1 --minWorkers=1
& $lockedPnpm --dir $env:TEMP exec node "$repo/node_modules/typescript/bin/tsc" --noEmit -p "$repo/plugins/mail/tsconfig.json"
```

## 集成与剩余

- Mail Module 当前签名保持基线，Lead 的共享 `ModuleProps.registerLeaveGuard` 无需本切片修改。共享注册、Engine 主入口及根锁保持基线，根锁 blob 为 `ce368ced5888cc3775d8e0265113737839e989d5`。本次没有新增依赖。账号测试、保存、取消继续通过现有插件装配动态注册，名称能力已加入 Mail 清单。
- 此轮覆盖分组和窄窗返回。拖动栏宽、右键菜单、OAuth 重授权、独立 SMTP 验证及真实桌面与 Web 组合安装包未验收。
- S1a.4 的前置条件仍缺失。现有 `ModuleCredentials.delete` 是版本化凭据原语，`mail.outbox.deleteLocal` 管理单条发件记录。当前没有账号级删除预览、在途停止与可能已接受投递证据保全的统一契约。本切片保留 S1a.4 待交付。

## 源码与指南

核对本机 one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`，README 第 223 行声明 AGPL-3.0-only。`src/components/account/account-list.tsx` 用于对照提供商分组、折叠与选中项，`src/components/account/account-form-types.ts` 用于对照预设名称和认证类型。采用交互参考，沿用 Huhu 的 Dialog、Field、账号预设、ModuleCredentials 和 ImapFlow 实现。

执行 Modern Web Guidance search 和 retrieve，采用 `forms` 的原生密码约束与显式标签，`accessibility` 的关闭后恢复触发元素焦点，以及 `stack-drill-down` 的逐级返回与焦点恢复思路。窄窗由现有容器查询和模块状态决定，保留工作台当前路由结构。目标兼容 Electron 固定 Chromium 152 与 Web Baseline Widely available，行为以 Edge 157 实测。

## Lead 核验

原 ID、原配置与隔离凭据的回环证据已读，提交 44941ecd 等冻结候选结束后合入。S2.5 按独立后续任务交付。
