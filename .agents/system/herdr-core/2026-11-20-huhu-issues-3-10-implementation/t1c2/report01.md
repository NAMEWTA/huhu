# task01 报告 · #8 S7.1／S7.2 邮件 AI

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t1c2`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c2/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c2/report01.md`
- 执行结果 — `done`，静态目录和发布校验由 Lead 装配

工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`。分支 `impl/huhu-issues-3-10-mail-ai`，起点 `1bac3348`，提交完毕后工作树干净。

| 提交 | 交付 | 验收 |
| --- | --- | --- |
| `b739090eb2e93f4d4598ca444c3b59a2a9ff4e53` | S7.1。邮件工作区可测试和保存默认关闭的 Mail 专用 AI 设置。Key 保留、替换、清除均带预期修订。保存到独立 Mail AI `ModuleCredentials` 命名空间 `mail.ai`，由 Windows Credential Manager 保护。 | 先通过真实 Windows Engine 与 Electron 两个合成验收再提交。真实 HTTPS 和 HTTP 夹具覆盖合成 ping、拒绝跳转、超时、失败保留、清除、重开和同 ID 新 Vault 无旧 Key。[S7.1 证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence-S7.1-mail-ai-settings.md) |
| `5c1c52a94fd68b2841047905dff6c8e0456427aa` | S7.2。单封正在阅读的邮件，选一个纯文本片段，确认已保存的目的地和模型。支持总结、待办、起草回复和一次提问。采纳回复后打开既有可编辑草稿。确认绑定 Workbench 主体、当前 Vault 生命周期与修订，单次使用。 | Electron 用两封合成邮件及隔离 IMAP 验证只发所选一段、未确认取消零请求、失败保留、结果安全渲染、修改并保存草稿和空发件箱。真实 Engine 验证跨 Vault、旧目的地、重复确认拒绝和取消在途连接。[S7.2 证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence-S7.2-mail-ai-selection.md) |

Windows Mail 全量串行 13 个文件、53 项通过。初次并行运行的既有 UID 隔离测试触及 5 秒超时，串行复跑耗时 1.26 秒。Electron 44.9.1 / Chromium 152.0.7977.167 构建、2 项 Playwright、Mail TypeScript、格式、lint、CSS 类及 Git 差异检查通过。使用隔离 Vault、合成资料和回环服务。本轮执行范围为 Windows，Git 交付为本机提交。

## Lead 接线

1. `apps/engine/src/boot.ts` 的 `registry.declareDescriptors("mail", [...])` 增加 `...Object.values(mail.mailAiCapabilityDescriptors)`。在 Engine 注册 Mail 的 `mail.apply` 调用末尾传 `{ aiCatalogDeclared: true }`，保持当前凭据 host、SMTP、同步和 OAuth 参数。当前分支已使用动态注册跑通，静态声明和绑定须同次装配。
2. Mail AI 的 `mail.ai` 是 ModuleCredentials 的内部 owner ID。公开 Vault 文件采用现有独立哈希命名，邮箱账号继续使用 `mail`。运行期机密目录仍由现有 host 管理且在 Vault 外。整包保留非秘密定义，恢复后重新配置 HTTPS Key；Mail 子集沿用已选邮箱账号范围。分支实测了 `exportPackage/importPackage` 与同可移植 ID 的新本地域。Lead 核对最终 Engine 包收集器、静态能力目录及发布安装产物。
3. 已登录 Web 复用工作区和同一 Engine handler，凭据设置和测试在 Engine 主机的桌面工作台完成。独立 Web 界面运行证据与最终安装包校验留给集成验收。对话当前按单次提问提交。取消已抵达模型端的调用会中止连接，服务端已接收数据的留存由该服务控制。
