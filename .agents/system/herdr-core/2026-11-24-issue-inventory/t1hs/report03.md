# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task03.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task03.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report03.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{060-f04,026-f06,031-f19}.md`
- 执行结果 — done（worker 交回）

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，基线 `4cdf922c`，交付 HEAD `d310d853`。三个独立提交均带 `Refs: #13`。`git diff 4cdf922c..HEAD --check` 通过，工作树干净。本批定向测试各文件的最终结果共 264 项通过，记在下方。已移除本批测试终端，无额外附件。

### F04 — `a57733b2`

- 文件 — `apps/engine/src/boot.ts`；`packages/vault/src/{package/package,trash}.ts`、`packages/vault/test/operations.test.ts`；`plugins/notes/src/engine/{comments/service,index,service}.ts`、`plugins/notes/test/service.test.ts`；`plugins/{inbox,tasks}/src/engine/{index,service}.ts` 及各自的 `test/service.test.ts`；`tests/e2e/workflows/vault-commit.spec.ts`。
- 回收站元数据和载荷使用独立位置。Vault 操作日志将文件或目录移动、完整后代身份映射、批注路径与永久清理的投影一并纳入提交。占名恢复前验证目标，改名恢复保留稳定身份。启动恢复后重新建立文件与批注索引，同次启动清理提交记录可以核实归属的退役目录。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/notes/test/service.test.ts`，51 项通过。覆盖原文件或目录名为 `meta.json`、同名拒绝、换名恢复和逐步骤失败，以及后代批注路径和清理。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/vault/test/operations.test.ts`，47 项通过。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/tasks/test/service.test.ts`，15 项通过。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/inbox/test/service.test.ts`，9 项通过。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/vault/test/package.test.ts`，17 项通过。
- Lead 执行 `tests/e2e/workflows/vault-commit.spec.ts` 中「F04 独立 Web 回收和桌面恢复 meta.json 文件与目录」。
- 回收与恢复使用同文件系统的原生独占移动。旧格式同名碰撞若已覆盖正文，现存字节无法核实为原载荷，列表跳过该条。跨文件系统、特殊符号链接场景和 Windows/macOS 实机待验证。

### F06 — `de5c6851`

- 文件 — `apps/desktop/src/{renderer/web-host.ts,web/main.tsx}`、`apps/engine/test/web-share.test.ts`、`packages/kernel/src/server/web-session-http.ts`；`packages/workbench/src/{engine-client/client,index,state/browser-drafts,state/flushers}.ts`、`packages/workbench/test/browser-drafts.test.ts`；`plugins/notes/src/ui/documents/{DocumentSession,browser-note-draft,useDocumentSession}.ts`、`plugins/notes/test/document-session.test.ts`；`tests/e2e/workflows/web-share.spec.ts`。
- Web 在编辑期间把恢复检查点写到按来源、Vault 和已认证会话隔离的浏览器存储。富文本桥有末次输入时，离场先同步结算。只有脏缓冲或回执待定时会触发原生提示。重开复用原草稿恢复入口。写入回读能核对与提交正文字节一致的检查点，仍待确认的正文可恢复。同版草稿在保存、明确丢弃或确认会话失效后移除。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/notes/test/document-session.test.ts`，F06 提交阶段 113 项通过。新增用例覆盖 800 ms 内离场、手动模式、断网、慢回执和保存过程中撤销后恢复。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/browser-drafts.test.ts`，2 项通过。覆盖浏览器离场监听与同源会话的存储键隔离和清理。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/web-share.test.ts`，4 项通过。覆盖真实独立分享入口，验证 bootstrap 标识在同一 Cookie 下稳定，两个会话标识不同。
- Lead 执行 `tests/e2e/workflows/web-share.spec.ts` 中「F06 浏览器刷新前询问，重开后恢复未提交正文」，以及 `tests/e2e/knowledge/session-flush.spec.ts` 中「C06 结算待定时退出并重启（自动保存）」「C06 结算待定时退出并重启（恢复草稿）」「C06 两篇笔记切 Vault 时，回执待定且已撤销的笔记也保留草稿」。
- 检查点受浏览器本地存储可用性及配额约束，存储失败时编辑会话显示错误并继续把未结算正文视为脏。浏览器原生提示需要浏览器支持和用户交互。无提示的移动端强杀和浏览器清除站点数据未实测。

### F19 — `d310d853`

- 文件 — `apps/desktop/src/renderer/{main,workbench}.tsx`；`packages/editor/src/rich/{OkRoot.tsx,index.ts,rich.d.ts}`；`packages/workbench/src/engine-client/client.ts`；`plugins/notes/src/ui/{index.tsx,archives/ArchivesViews.tsx,viewers/TextFileView.tsx,documents/{DocumentSession.ts,DocumentSessionRegistry.ts,NoteEditorSurface.tsx,useDocumentSession.ts}}`、`plugins/notes/test/document-session.test.ts`；`tests/e2e/knowledge/session-flush.spec.ts`。
- 会话按 Vault 和路径持有。桌面引擎连接显式换代时停止旧读取和排队保存。同 Vault 重连以新端点复读磁盘，然后使用该端点和查询缓存。读回内容若与旧提交吻合，就以它建立基线并保留后续输入。读回不匹配时保留现场、阻止自动覆盖，并允许退出保留草稿。Provider 缓存随代次释放，零引用脏会话重连后完成结算和注销。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/notes/test/document-session.test.ts`，117 项通过。新增覆盖同 Vault 打开及停放笔记、连续重绑及旧读取取消、其他 Vault 路径隔离、旧回执有无落盘、失联时归零后结算和注销。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/editor/test/provider-pool.test.ts`，2 项通过。
- Lead 执行 `tests/e2e/knowledge/session-flush.spec.ts` 中「F19 桌面同 Vault 连续重启后恢复打开和停放的笔记，并向新引擎保存」。用例含两次引擎进程退出、停放笔记外改、重开后的保存和退出保留草稿。另 Vault 隔离由单测覆盖。

### 未运行项

- 待 Lead 逐包类型检查 `@huhu/vault`、`@huhu/kernel`、`@huhu/workbench`、`@huhu/editor`、`@huhu/engine`、`@huhu/desktop`、`@huhu/plugin-notes`、`@huhu/plugin-tasks`、`@huhu/plugin-inbox`。新增代码沿用 ES2023。
- 待 Lead 执行上述 Playwright 用例。构建、打包、全量测试、全仓 lint、knip 和截图取证均未运行。

## 阻碍与接续

无实施阻碍。等待 Lead 在整合版本上验收并回写业务验收记录。

## Lead 验收

- Lead 2026-11-24：合入 main b289ac3f，9 包类型检查通过，E2E 23/23 通过。清单转 task04。
