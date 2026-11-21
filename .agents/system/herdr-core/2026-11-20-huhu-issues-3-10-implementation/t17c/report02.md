# t17c · #8 首封 IMAP 邮件、正文与已读状态

## 交付

本地提交 `94dc30a5854375c26d23a3339f20decca980e407`，父提交 `20567cc22d1dd661331015130001d106c0bc0b0e`，分支 `impl/huhu-issues-3-10-mail-confirmed-ui`。提交包含 `plugins/mail` 和 #8 对应任务证据，工作树干净。原型四个资源仍与确认提交 `7d17ffa6` 一致，记录的指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。 [回环证据与截图](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1-S2-mail-reader.md)

- **S1a.2 首封收件。** 从已保存邮箱的同步目录进入。Engine 沿用 IMAP `EXAMINE` 与 `BODY.PEEK`，摘要可显示未读，选择邮件主题后才请求正文。账号、目录、UIDVALIDITY、UID 定位沿用现有模型。
- **S2.3 安全正文。** `mail.messages.loadBody` 从既有缓存解析 MIME，解码正文并列出附件名称与 MIME 类型。阅读区有失败重试、HTML、纯文本、原文、长正文展开与引用折叠。HTML 仅由允许的结构生成 React 节点，外部图片显示屏蔽提示，原文作为文本展示。
- **S2.4 已读状态。** 正文就绪、进入视口且页面可见后才发出 `mail.messages.markRead`。Engine 先在同一缓存记录本机已读，再核对 UIDVALIDITY、对当前 UID 执行 `UID STORE +FLAGS.SILENT (\Seen)`，随后用 `UID FETCH FLAGS` 验证。没有确认时保留「本机已读 · 待同步」，可显式重试。刷新与标读在同一目录串行提交，换代不会把旧状态套到新消息。只读 Vault 可阅读已有缓存，阻止标读和同步写入。继承的无已读字段缓存仍可读。

## 实际验证

Windows 上使用 Node 24.21.0、固定 pnpm 12.10.1、Vitest 3.2.7 与 Edge 157.0.4341.60。测试使用临时 Vault、合成账号和本机 IMAP/SMTP，不连接外部服务。旧测试保持账号、草稿和发件箱覆盖，扩展的界面探针也再次走完这些路径。

| 检查 | 实际结果 |
| --- | --- |
| Mail 全部测试 | 7 文件 36 项通过，其中 35 项为常规 Mail 用例，1 项为临时放回测试目录的 Edge 组件探针。 |
| Engine HTTP | 两个邮箱同 UID 得不同本地 ID，原文及正文各自正确。摘要、正文、原文读取和只读标记合计 0 次 STORE。回环服务先接受 STORE 但 FLAGS 不变，本机待同步经刷新和重开仍在。显式重试后确认，已确认重复请求不增加 STORE。UIDVALIDITY 变化时，旧 ID 不执行 STORE，旧正文提示刷新。正常确认与换代合计有两次 STORE，仅作用于第一账号。 |
| 阅读界面 | 注入首次正文请求失败，重试后留在同一邮件。强制正文处于视口外时，标读请求为 0。滚入视口时才发起首次标读，界面从待同步过渡到显式重试后的服务器确认。实际检查 HTML、纯文本、引用、长正文展开、原文和附件元数据。脚本未执行，合成图片、CSS 和框架共 0 个外部请求。探针以隔离桥接访问真实回环 Engine，覆盖 1440×900 阅读，另沿用 390×844 验证发件箱。 |
| 静态 | Mail TypeScript、改动文件 Oxlint、Stylelint、Oxfmt、CSS 颜色/分层/类名/所有权/重复检查，以及 `git diff --cached --check` 均通过。 |

从工作树根取 `$repo=$PWD.Path`，用本机缓存版本 `$lockedPnpm` 执行以下核心命令。探针临时放置及还原方式见 [重跑和探针](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1-workbench.md#重跑)。

```powershell
& $lockedPnpm --dir $env:TEMP exec node "$repo/node_modules/vitest/vitest.mjs" run --root $repo --project '@huhu/plugin-mail' --maxWorkers=1 --minWorkers=1
& $lockedPnpm --dir $env:TEMP exec node "$repo/node_modules/typescript/bin/tsc" --noEmit -p "$repo/plugins/mail/tsconfig.json"
```

## 集成与范围

- 原 Engine 按 Mail 清单动态注册两项能力，当前 HTTP 入口已验证。共享 Engine 入口、Renderer、公共契约与根锁保持基线，根锁 blob 为 `ce368ced5888cc3775d8e0265113737839e989d5`。Lead 在合并根锁时需为 `plugins/mail` 加入已在仓库锁定的 `@zone-eu/mailsplit@5.4.31` 和 `parse5@8.1.1` 的直接 importer 引用。测试仅在当前工作树的忽略目录链接既有锁定版本。
- 当前仍是每个所选目录缓存最新一封。已读状态和正文定位跟随这份可重建缓存，缓存继续排除在 Vault ZIP 外。完整历史、联系人及 API 邮箱协议保持各自原定切片。
- 单封外部图片放行依赖共享资源策略。目前 `apps/desktop/src/renderer/index.html` 的 CSP 为 `img-src 'self' data:`，本切片验证了默认屏蔽。实际桌面外链使用已有的宿主复制能力，直接由系统浏览器打开需要共享宿主入口。完整 Electron、真实 LAN Web 会话与安装包尚未验收。
- 没有新增 agent、远端操作或外部邮箱请求。探针与用例关闭了各自回环服务、隔离 Vault 和合成凭据。

## 源码与现代 Web 指南

核对本机 one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`，README 第 223 行声明 AGPL-3.0-only。参考 `src/components/conversations/conversation-message-content.tsx` 的视口观察和正文交互，`src/components/mail/mail-html.ts` 与 `src-tauri/src/mail/body/format.rs` 的远端资源屏蔽，及 `src-tauri/src/mail/sync/imap.rs` 的 FLAGS 查询。采用交互及处理思路，代码以 Huhu 已装配的 ImapFlow 2.12.1、现有缓存和工作台组件实现。MIME 使用已锁定的 `@zone-eu/mailsplit@5.4.31`，许可证声明 MIT OR EUPL-1.1+，HTML 解析使用 MIT 的 `parse5@8.1.1`。

已执行 Modern Web Guidance 的 search 和 retrieve。使用 `sanitize-untrusted-html` 的元素与属性允许清单原则、`security` 的程序化构造元素和纯文本展示原则，以及 `scrollspy` 中的 IntersectionObserver 方法检测正文可见性。解析器在创建 DOM 节点前完成结构解析，兼容固定 Electron 44.9.1 的 Chromium 152 和 Web Baseline Widely available。

## Lead 核验

已检查回环证据、读取能力及 HTML 结构限制和标读持久化。组合来源提交 77edc5bd，两个既有解析器在 Lead 的锁更新中装配。
