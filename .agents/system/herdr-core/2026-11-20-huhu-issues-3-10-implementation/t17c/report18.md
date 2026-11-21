# task18 报告 · #8 Mail 数据管理

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task18.md`
- 报告文件 — `t17c/report18.md`
- 执行结果 — `done`

交付分支为 `impl/huhu-issues-3-10-mail-data-settings`，基线为 `42d332a9083c83c3f3054afc449fd0c01f0b1421`。提交范围为 Mail 插件与 #8 的验收证据。当前工作树干净。

## S7.3 缓存占用与清理

提交 `1127e370ab6d3a9cb9e49b473aa39e38fc72eced`，桌面确认焦点修正 `6ce5a8500e840f347377775361d666dcfa57d69d`。

- Mail 设置分别列出受管缓存文件的真实字节数和内存搜索投影的条数与文本字节数。用户确认后，等待旧缓存代的同步与写入退出，作废邮件查询与定位，再清理副本、游标及索引。清理后后台监听与定时从新一代开始。
- Windows 隔离 Engine HTTP 回归在第二封回环 IMAP 邮件仍待读取时清理，晚到结果未使正文或搜索重现。重启后缓存为空，从 IMAP 重新同步可恢复查询并保有原本地已读标记。草稿附件、原账号修订与凭据、未知投递均保全。只读与无确认路径均拒绝清理。
- Windows Electron 工作台打开确认框时默认聚焦「取消」。取消后仍可清理，确认后显示结果，空缓存时禁用清理按钮。 [S7.3 验收证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S7.3-cache-settings.md)

## S6b.1 Huhu Mail 子集

提交 `6c88b90b08c8a6ebca66f019798f64184ba9fb47`。

- Workbench 可勾选邮箱创建 ZIP，再选取 ZIP 预检。复用 Huhu v1 清单、路径、SHA 检查和临时目录解包，Mail 负载另有类型与版本。入口限 5 MiB 压缩包，解包后的 Mail 负载限 36 MiB，附件合计限 25 MiB。包含非秘密配置、草稿、已读覆盖、受管附件及投递事实。缺少的附件列为待重新选择，恢复后需配置本机认证。
- 预检同时显示包内邮箱和已有同地址账号。确认只接受明确勾选的无冲突项，提交时再次检查地址与记录标识。取消预检对目标 Vault 无写入。多个已选账号分别提交，若后续项失败，重新预检会标明此前已完成的项。
- Windows 隔离 Engine HTTP 回归覆盖有效 Huhu ZIP、损坏包、错误类型和超限。取消与冲突都保全原账号修订。写入故障回滚附件等暂存状态，账号提交后确认记录写失败可在重开后核实。相同预检重试和重开重试均不重复生成。附件字节、已读、本地未知投递保留，SMTP DATA 总计为源 Vault 的 1 次。
- Windows Electron 生产构建通过 Playwright 工作台复验。实际下载 ZIP 后在第二个隔离 Vault 文件选择、预检与取消，冲突项显示目标账号且不可勾选。重试后只恢复勾选的无冲突账号。Windows 安装器未运行。 [S6b.1 验收证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S6b.1-subset-restore.md)

## 核对与集成

Windows Mail 全量 11 个文件、51 项通过，包含 Gmail history 和 Exchange IMAP 回归。一次并行构建期间既有 UID 用例触及默认 5 秒超时，限制为两个 worker 并采用 20 秒上限的复跑全绿。TypeScript、格式、lint 和差异检查通过。Windows 验证使用隔离 Vault、合成邮箱和回环服务。

task19 已另行交付 `e01b5b06423806d7685046578fa257157c8b468e`。用 `git merge-tree` 核对与当前交付的合并，发现唯一冲突文件为 `plugins/mail/src/engine/accounts.ts`。合并时应保留 `restoreDefinition` 与 `confirmOAuthCommit`，并在新 OAuth 账号保存的地址互斥内使用携带 task19 会话见证的受保护 token。OAuth 修复时继续保留 task18 的恢复指纹。 [task19 报告](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report19.md)
