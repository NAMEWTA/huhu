# t17c · #8 Mail 账号、草稿和重试工作区

## 交付状态

已提交本地候选 `20567cc22d1dd661331015130001d106c0bc0b0e`，父提交 `d036effb58a55d2fe99901c5fe3381ec1a4e9f34`，分支 `impl/huhu-issues-3-10-mail-confirmed-ui`。工作树干净。提交范围为 `plugins/mail` 与 #8 证据。原型文件与原型确认提交 `7d17ffa6` 完全一致，确认指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。 [证据、重跑命令和截图](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1-workbench.md)

- **邮箱添加与连接测试。** 复用 Mail 的 18 个命名预设和自定义项、现有 IMAP 目录发现与私有凭据持久化。表单修改使旧连接结果失效。取消或超时会清理临时会话，保存要求选中 INBOX 并拒绝不可选择的目录。同会话重复保存返回同一账号。同 Vault 的重复邮箱会被提示。
- **草稿保留。** 非模态写信支持扩大、发件人、收件人、抄送、密送、主题及 Tiptap 富文本。关闭前保存修改，保存失败保留编辑内容，可在本机草稿中继续编辑。通过现有离场参与者对接桌面关闭窗口与 Vault 切换。原附件引用在保存时随草稿保留。
- **部分接受和待核实。** 发件箱展示逐收件人的结果、SMTP 状态码和 Message-ID。重试按钮只发送用户勾选且由 Engine 判定为明确未投递的地址。SMTP 最终回应丢失时显示「待核实」，核对按钮刷新本机记录，并提示使用 Message-ID 向服务商核对。重启不会触发 SMTP 重发。
- **凭据入口。** 普通邮箱密码只经现有桌面回环身份提交。普通 LAN Web 使用 HTTP，因此采用与 SSH 配置相同的桌面入口约束。Web 中的邮箱列表、草稿和发件箱组件复用工作台接口。OAuth 预设说明其授权前置条件，实际 OAuth 会话留待对应切片。

## Windows 验证

| 检查 | 命令和实际结果 |
| --- | --- |
| Mail 自动化 | 固定 pnpm 12.10.1 在临时目录执行 `exec node "$repo/node_modules/vitest/vitest.mjs" run --root $repo --project '@huhu/plugin-mail' --maxWorkers=1 --minWorkers=1`。7 文件 36 项通过，其中 35 项是常规 Mail 回归，1 项是临时放回测试目录的 Edge 渲染探针。最终 UI 调整后单独复跑探针，1 项通过。 |
| 回环副作用 | 真 IMAP 验证拒绝认证、在途 LIST 取消、失效会话无法保存、INBOX 与不可 SELECT 检查，以及保存后重开。真实 SMTP 两次 DATA 的收件人分别为原接受组和明确拒绝项。丢失最终回应后重启，仍为待核实，DATA 一直为 2。 |
| 界面 | Edge 157.0.4341.60，Playwright 1.65.0。实际组件在 1440×900 操作邮箱添加、表单编辑使旧目录失效及对话框关闭后焦点恢复。阻断首次草稿保存后，正文保留，重试并继续编辑后粗体保留。走通部分接受、只选拒绝地址重试及待核实。390×844 检查状态、操作可见和无横向溢出。探针通过隔离 HTTP 桥接到真实 Engine，截图和脚本已入提交。 |
| 静态检查 | 固定 pnpm 下运行 `tsc --noEmit -p plugins/mail/tsconfig.json`、改动文件 Oxlint、Stylelint、Oxfmt 以及根仓库 CSS 颜色、分层、类名、所有权和重复检查，均通过。`git diff --cached --check` 通过。 |
| 依赖与清理 | 本机全局 pnpm shim 无法启动，改用缓存中的固定 Windows 12.10.1 原生二进制。本工作树的忽略目录从已安装的同版本依赖解析新 UI 引用。根锁字节核对为原始 blob `ce368ced5888cc3775d8e0265113737839e989d5`。首次探针发现默认 Chromium 缓存版本不匹配，后续全部使用已安装 Edge。首次启动留下一个合成空 Vault 临时目录，自动审批拒绝 PowerShell 递归删除该目录，工具只返回 `blocked by policy`。该路径是 `C:/Users/cdewta/AppData/Local/Temp/huhu-mail-renderer-proof-LVI3qJ`。完成的探针和回环用例已清理各自测试 Vault 与凭据。 |

测试使用本机回环与合成数据。没有向外部邮箱发信，没有推送或修改远端，没有启动其他 agent。

## Lead 接入和剩余验证

1. 在 `apps/desktop/package.json` 增加 `@huhu/plugin-mail: workspace:*`。在 `apps/desktop/src/renderer/main.tsx` 的共享 `App` 入口导入 `@huhu/plugin-mail/ui` 的 `contributions`，加入现有 `ContributionRegistry`。同文件的桌面与 Browser Boot 均使用该入口。插件清单已声明模块 `mail` 和三项账号设置能力。
2. 根锁更新 `apps/desktop` 的 Mail workspace 引用和 `plugins/mail` 自身新增的 UI importer 依赖，含 Workbench、UI、React、Lucide、Tiptap React、StarterKit 及 React 类型。Tiptap 两包沿用仓库已锁定的 3.22.3。更新后按 12.10.1 做冻结安装及组合验收。
3. 现有 Engine 已装配 Mail 插件、凭据宿主与 SMTP。三个账号动作跟随已启用的 Mail 动态登记，当前 Engine 已通过真实请求。若组合交付需要在插件停用时也呈现这三个动作的静态元数据，由 Lead 与公共目录接线一起迁移为静态描述并绑定。
4. 普通模块切换会卸载 Mail，当前 AppShell 的离场参与者接线覆盖 Vault 切换和桌面窗口关闭。组合外壳还需在模块切换前调用同一离场检查，确保未经关闭的脏草稿也能拦截离开。当前证据覆盖写信关闭保存失败和成功重开，未实测完整 Electron 外壳、实际 Web 登录会话或候选安装包。
5. 本轮工作区覆盖确认过的四条主路径。正式 OAuth、账号重新配置与删除、附件上传或重新绑定、联系人及完整阅读工作区、服务商远程对账留在对应切片。当前 SMTP 传输使用草稿正文的纯文本表示，富文本在本机草稿中持久保存。预设表沿用现有实现，逐提供商的实际连接和证书兼容留待授权环境验证。

## 源码与指南

- 查阅本机 `temp/sources/one-mail` 提交 `d1be24d5bb83c2da7123b167f119d5abd169b0af`，其 README 第 223 行声明 AGPL-3.0-only。`src/components/account/account-form-types.ts` 用于对照 18 个预设、自定义和认证字段。`src/components/mail/outbox-panel.tsx` 用于对照列表选择、续编与查看详情的交互。`src-tauri/src/mail/smtp.rs` 用于对照 SMTP 开关和投递历史。采用了交互与信息结构参考，当前实现使用 Huhu 原有预设、能力、私有凭据与传输代码。
- 使用 Huhu 的 Dialog、Field、工作台通知和 `useCapability`。富文本编辑复用仓库现有 `@tiptap/react` 和 `@tiptap/starter-kit` 3.22.3，MIT，采用 StarterKit 的正文、粗体和链接能力。
- 执行 Modern Web Guidance 的 search 和 retrieve，核对 `forms`、`validate-input-after-interaction`、`accessibility` 与 `size-aware-styling`。实际采用原生表单约束、显式标签、原生对话框、关闭后恢复焦点、状态播报和默认纵向堆叠的容器查询。目标按固定 Electron 44.9.1 的 Chromium 152 与 Web Baseline Widely available 核对，浏览器行为在 Edge 157 实测。

## Lead 验收

核对提交 20567cc2、实际模块产物和本机自动化证据，接入共享 Renderer 和根锁由 Lead 处理。完整外壳与实际登录会话留待组合复跑。
