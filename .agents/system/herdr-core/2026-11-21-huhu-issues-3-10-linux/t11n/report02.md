# 手动保存回执竞态修复

任务 `t3p / t11n / task02.md`，工作树 `agent-linux`，基线 `4ae7e7e4`。实现及回归用例已写入工作树，等待 Lead 处理下列调用点并运行验证。

## 保存行为

- [DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts) 中，手动 `flush()` 先结算编辑器交付并等待先前已在途的写入，按现有版本队列发出本轮保存。成功回执结束本轮，发出请求之后输入的内容仍在编辑器中并保持 dirty。失败仍返回 `false`。已有写入在队列前方时，本轮沿用等待并重新结算的行为，写入快照在本轮请求发出前取得。
- 自动模式的 `flush()` 继续排空。`flushForExit`、模式切换、文件路径变更与 Vault 切换确认保存明确使用 `untilClean: true`；手动模式的 `flushForExit` 等待首个回执后，可以将后续输入按新版本保存为草稿。
- [document-session.test.ts](../../plugins/notes/test/document-session.test.ts) 保留 task01 的红灯用例，新增「手动保存回执在途时退出：以该回执的版本保留后续输入的草稿」。
- [session-flush.spec.ts](../../tests/e2e/knowledge/session-flush.spec.ts) 新增「C06 手动保存回执在途时继续输入，下一次点击才写入新内容」。测试包装同一个隔离窗口中匹配路径的真实 `notes.save` 请求，确认首笔已落盘再输入，暂缓期间继续使用真实编辑器。回执 JSON 读取后的渲染帧提供观察边界。断言第一次回执后仍只有一笔请求，正文保持 dirty，第二次点击才写入完整正文。清理时恢复原 `fetch` 并解除闸门。

## Lead 待处理的调用点

以下文件在本任务可写目录之外。`untilClean: true` 可保持依赖正文全部落盘的调用契约。

- [ArchiveView](../../plugins/notes/src/ui/archives/ArchivesViews.tsx) 第 328 行的 `call` 包装器改用 `session.flush({ untilClean: true })`，用于档案移动、重命名和删除等后续操作。第 453 行的「保存」按钮继续用默认 `session.flush()`。
- [useCommentsBridge](../../plugins/notes/src/ui/comments/useCommentsBridge.ts) 第 32 行的按路径 `flush` 调用加 `{ untilClean: true }`。为无路径分支，在 [NoteDocument](../../plugins/notes/src/ui/NoteDocument.tsx) 第 128 行将传给 `registerFlush` 和编辑面 `flush` 属性的回调改用 `{ untilClean: true }`，并在第 143 行用独立的 `useCallback` 调用默认 `session?.flush() ?? Promise.resolve(true)` 作为按钮、菜单和 Mod+S 的 `save`。这样批注和手动保存各自等待所需的提交范围。
- [shell.spec.ts](../../tests/e2e/shell.spec.ts) 的「设置：编辑器页的开关真正生效」用例在工作树第 1700–1703 行。第一次文件断言后，等待 `expect(page.getByTestId("save-state")).toHaveText("已保存")`，再点击 `.ProseMirror` 并用 `ControlOrMeta+End` 放回文末，然后输入快捷键后缀。Mod+S 后、输入离场草稿前也可等待同一保存状态，避免将下一段输入落在快捷键保存回执窗口内。

## 验证证据

Lead 的 task01 红灯为 35 通过、1 失败。新增用例期望磁盘 `A`，实际收到 `A+B`。日志位于主工作区 `temp/issue-evidence/huhu-2026-11-22/manual-save-red.log` 第 44–64 行。

## 未运行的验证

本轮没有运行修复后的 Vitest、Playwright/Electron、类型检查、构建或打包。可先由 Lead 运行 `pnpm exec vitest run plugins/notes/test/document-session.test.ts`，再运行上述 E2E 和原快捷键用例。E2E 回执探针仍待实跑。

## Modern Web Guidance

- **`js`**：使用本机缓存完成 `search` 和 `retrieve`。E2E 用 `Promise.withResolvers()` 让保存回执暂停在真实 HTTP 响应之后，再由测试步骤决定放行（“when a promise's `resolve` and `reject` callbacks must be stored or invoked outside the `new Promise` executor scope”）。
