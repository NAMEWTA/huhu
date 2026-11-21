# #8 S1a.1 邮箱定义、目录发现和模块凭据写入

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t9k
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t9k
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t9k/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t9k/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/mail，分支 impl/huhu-issues-3-10-mail，冻结基线 `5beba4c1c8028988a9c7440584fbcd4c71b2b4fb`。

按 dev-build/dev-verify，读 #8 spec/design/S1a.1/S0.2 证据，与 #9 P0.2/P7.1 的已集成 `ModuleCredentials`、受信 Owner、用途 target 和测试夹具。实现可测试的 `plugins/mail` 私有邮件账号定义、版本、预设与自定义配置、目录发现结果、目录选择及提交事务。对照实际原 Issue 与 OneMail 来源记录，保留 SMTP 开关与用户覆盖，拒绝迟到的旧设置测试结果，网络/本机保护错误后无半个账号，成功后重开读回。以隔离测试 Vault 和真实私有 `ModuleCredentials` 注入合成保护。目录传输按已选 TS 路径，能用 S0.2 的 ImapFlow 回环夹具时实际重放；锁定依赖和许可先记录，不能接入时保留清晰注入契约与复现证据。绝不使用真实邮箱、凭据、原生历史或公网发送。

仅写 `plugins/mail` 及该任务必要的就近夹具/证据。Engine/Renderer 及全局插件注册、根锁和 Vault 包收集均由 Lead 持有，若新增本地包，在报告给具体依赖版本、manifest 和锁接线要求。暂不落地原型待确认的 UI。只在 Windows，禁止远端写入、开额外 worktree 或自行派遣。按精确 SHA 提交并测试，关闭已完成且无后续用途的命令 pane。
