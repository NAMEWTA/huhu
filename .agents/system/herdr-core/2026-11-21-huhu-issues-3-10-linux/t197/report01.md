# t197/task01 · 停放恢复草稿竞态

Lead `t3p`，实施者 `t197`，状态 `done`。基线 `17ce3c60f38ac769ef8dd6b5b56c78e2efe21074`。 [正式任务](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t197/task01.md) · [独立审查](t194-report01.md)

## 修复与证据

| 场景 | 修改源码前 | 修复后 |
| --- | --- | --- |
| 恢复已取样草稿时点击丢弃 | 磁盘已删除，迟到读数仍恢复了横幅 | 正文载入版本 2，草稿保持为空 |
| 停放恢复时草稿删除仍在途 | 正文已更新，当前会话又显示待删除草稿 | 正文独立更新，草稿保持为空，条件删除正常结算 |
| 正文读取成功，`notes.draft.get` 拒绝 | 正文载入版本 2，已知草稿和错误均为空 | 保留已知草稿，显示「读取草稿失败」与引擎错误；成功读到无草稿后清除恢复入口与错误 |
| 正文读取返回时 drainer 尚有编辑待交付 | drainer 调用 0 次，恢复读取可以接纳外部正文 | 恢复等待 drainer；交付后保留本地正文、脏状态和版本 1，磁盘版本 2 保持原样 |

- 丢弃序号和在途删除计数用于判断草稿读数是否有效。丢弃前或删除过程中取样的草稿结果会跳过，后续常规复读可发现新的草稿。正文仍按现有会话基线、编辑 revision 和磁盘 revision 接纳。显式重载和重开草稿仍按原路径处理所需的草稿读取错误。 [载入与接纳](../../plugins/notes/src/ui/documents/DocumentSession.ts#L246) · [草稿删除](../../plugins/notes/src/ui/documents/DocumentSession.ts#L979)
- 已加载会话要接纳不同正文时调用现有 drainer，并在交付后重查基线和 revision。会话层竞态已用实际 Registry、实际 DocumentSession 和受控异步 drainer 证实。富文本使用生产 `RichEditorPort.flush()` 的实际结果待 Lead 实跑。对照过现有 Huhu 会话接口和参考库 Open Knowledge 的编辑器缓存，沿用 Huhu 已有接口。 [会话 drainer](../../plugins/notes/src/ui/documents/DocumentSession.ts#L373) · [富文本 flush](../../packages/editor/src/rich/RichMarkdownEditor.tsx#L537)

## 已运行的验证

- 修改生产源码前，同一个 Vitest 文件按用例名筛选，4 项按预期失败，97 项跳过，退出 1。失败差异见日志第 115–191 行。 [红灯](/tmp/huhu-t197-regression-red.log#L115)
- 修复后 `pnpm exec vitest run plugins/notes/test/document-session.test.ts`，101/101 通过，退出 0。 [绿灯](/tmp/huhu-t197-regression-green.log)
- 三个改动文件通过定向 `tsc --noEmit`、`oxfmt --check`、`oxlint -c oxlint.json` 和 `git diff --check`。首次定向类型命令缺少已有的 `apps/desktop/src/renderer/env.d.ts`，带入该声明后退出 0。
- 工作树交付文件为 `DocumentSession.ts`（blob `a722c065a776d560e8ab3c1c62d41769057149a9`）、`document-session.test.ts`（`bdc98cb38c75d26bfdd35ddcc42b64a99fbf98e4`）、`session-flush.spec.ts`（`3acc3b8877475e96caf1bf3fa19b00625860a7f0`）。Registry 沿用基线实现。交付通过工作树，未创建提交。

## 未运行的验证

- E2E `tests/e2e/knowledge/session-flush.spec.ts` 中的 **C06 停放恢复读盘在途时保留富文本组合输入，条件保存仍保护磁盘新版**。用例经能力网关停放会话、写入外部正文、延迟真正的读取回执，再通过 Chromium CDP 在生产 ProseMirror 编辑器组合和提交输入。断言最终文本、条件写入冲突、磁盘版本保留和确认保留本地稿后的保存。 [新增用例](../../tests/e2e/knowledge/session-flush.spec.ts#L149)
- Electron、E2E、构建、打包及全仓检查留给 Lead。CDP 可覆盖 Chromium 合成的组合事件，真实操作系统输入法行为仍待验证。

### Modern Web Guidance

我运行了 `search` 并读取 `ime-safe-enter-submit`。本次竞态发生在正文回执接纳和编辑器交付之间，指南的 Enter 键提交策略无需应用。E2E 沿用生产用例已有的 CDP 组合事件方式。 [Chromium Input 域](https://chromedevtools.github.io/devtools-protocol/tot/Input/) · [Electron 44.9.1 内置 Chromium 152](https://releases.electronjs.org/release/v44.9.1)
