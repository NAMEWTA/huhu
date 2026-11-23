# 保存回执审查修复

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- Lead — `t3p`
- terminal_address — `t12c`
- task — `t12c/task01.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/temp/final-audit/t12c-report01.md`
- 执行结果 — done，改动和回归用例已写入，运行验证由 Lead 接续。
- 工作树 — `agent-linux`，分支 `impl/huhu-mail-graph-completion`，HEAD `4ae7e7e4`，已保留前序未提交改动。

## 改动

- 手动 `flush()` 在第一轮编辑器交付后锁定本次正文，再把保存排进原有写入队列。写请求取上一笔回执更新后的版本，新输入继续留在会话。普通文本的显式 `save()` 同样锁定正文，后台自动保存仍在轮到写入时取正文。等价 Markdown 规范化仅可更新对应的当前 revision。[DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts#L241)
- 档案字段写入继续使用同一队列。字段回读按实际落盘的正文合并到当前缓冲和等待中的保存快照。某笔快照与字段修改冲突时，该笔返回失败并保留当前编辑。扩展既有字段用例，确认字段落盘之后的明确保存保留字段和该次正文，稍后的输入还留在缓冲。[字段队列](../../plugins/notes/src/ui/documents/DocumentSession.ts#L315) · [档案字段单测](../../plugins/notes/test/document-session.test.ts#L239)
- 档案移动、重命名、删除等经现有包装器先等正文结清。批注有路径时走该会话的 `untilClean`，无路径时经编辑面或详情栏回调进入同一排空语义。笔记保存按钮、应用菜单和 Mod+S 使用独立的默认保存回调，档案保存按钮也沿用默认语义。[档案包装器](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L327) · [批注桥](../../plugins/notes/src/ui/comments/useCommentsBridge.ts#L31) · [笔记回调](../../plugins/notes/src/ui/NoteDocument.tsx#L128)
- 并发回归先于生产补丁写入。单测控制两笔回执，断言实际请求依次是 `A @1`、`A+B @2`，最后磁盘是 `A+B`，会话仍保留 dirty 的 `A+B+C`。新 C06 用例沿用真实 HTTP 回执探针，通过状态栏字数确认第三段已交给会话，观察第二笔回执后的磁盘和 dirty 状态，再点击保存第三段。旧 Mod+S 用例等待按钮保存和快捷键保存各自显示「已保存」，快捷键段开始前点击正文并移到文末。[并发单测](../../plugins/notes/test/document-session.test.ts#L143) · [C06](../../tests/e2e/knowledge/session-flush.spec.ts#L147) · [Mod+S](../../tests/e2e/shell.spec.ts#L1699)

## 红灯与绿灯待跑

红灯在隔离副本保留本轮单测，并使用审查时的前序 `DocumentSession.ts`。也可在隔离副本把当前 `flush()` 的 `if (!untilClean)` 分支移回等待 `inflight` 和检查干净状态之后，复现旧的等待再取样行为。预期第二笔请求的版本仍为 `2`，正文断言会收到 `A+B+C`，期望为 `A+B`。

```sh
pnpm exec vitest run plugins/notes/test/document-session.test.ts -t '并发手动保存按各次触发时的正文和前一回执版本写入'
```

绿灯使用本轮工作树和 Lead 准备的桌面构建。依次运行以下定向命令。

```sh
pnpm exec vitest run plugins/notes/test/document-session.test.ts
pnpm exec playwright test tests/e2e/knowledge/session-flush.spec.ts -g 'C06 (手动保存回执在途时继续输入|两次手动保存重叠时)|应用菜单保存当前文档'
pnpm exec playwright test tests/e2e/shell.spec.ts -g '设置：编辑器页的开关真正生效'
pnpm exec playwright test tests/e2e/knowledge/comments-s4.spec.ts -g 'D01/D02'
pnpm exec playwright test tests/e2e/workflows/archives-tabs.spec.ts -g 'E04 在途 Markdown 保存完成后'
```

档案路径操作的审查时序可在手动保存模式下走档案的重命名确认。延迟首笔正文回执，退出确认框后继续编辑正文，放开回执后检查重命名后的 `index.md` 是否包含末段。上面的 E04 自动化对应档案字段与在途正文写入。

## 未运行的验证

本轮未运行 Vitest 红灯或绿灯、Playwright/Electron、全量测试、全仓类型检查、lint、构建、打包、安装包检查或截图。按任务约定由 Lead 验证。

## Modern Web Guidance

Lead 在其环境执行 `handle keyboard shortcuts` 查询并提供 [accessibility 指南](/tmp/mwg-guide-3251895-1795366754441.md) 与已有的 [js 指南](/tmp/mwg-guide-3235787-1795365728802.md)，本轮已分段完整读取两份资料。

- **`accessibility`** 我在快捷键回归中显式把焦点放回正文，再通过实际键盘输入测试快捷键。依据为「Manage focus correctly to and from updated content」。产品沿用现有的键盘绑定。
- **`js`** 我用 `Promise.withResolvers()` 从测试步骤控制两笔保存回执的放行顺序。依据为「resolve and reject callbacks must be stored or invoked outside the new Promise executor scope」。
