# t176/task20 · 停放文档恢复时核对磁盘

Lead `t3p`，worker `t176`。FakeEngine 已复现 report19 提出的会话缺口。已加载的会话仅剩停放引用时，磁盘正文可以前进到版本 2，而恢复的第一个活动租约仍拿到版本 1。修复后同一会话可以读到版本 2。固定候选的实际事件交付顺序仍待原包用例验证。 [report19](t176-report19.md) · [红灯日志](t176-park-resume-red.log)

## 改动与行为边界

- Registry 等待现有停放结算结束。已加载会话从仅有停放引用切回活动时，先登记第一个活动租约，再发起一次现有外部变更核对，租约正常交付。后续活动租约共享同一会话，首次加载仍走原入口。 [恢复点](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L79)
- 干净会话走已有 guarded load，更新正文与基准版本并保留独立的可恢复草稿。脏会话读盘确认冲突并保留本地正文。读盘在途时，如果新输入进入会话，已有 revision 校验会丢弃过时读取结果。恢复调用本身只走读取和冲突判断，无新增保存触发。 [现有外部核对](../../plugins/notes/src/ui/documents/DocumentSession.ts#L788)
- 四条回归分别覆盖干净恢复、可恢复草稿、脏缓冲冲突，以及读盘期间新输入与并发租约。干净路径与在途路径断言活动租约共享一次正文读取，四条均断言无 `notes.save`。 [回归用例](../../plugins/notes/test/document-session.test.ts#L2086)

## 验证

- 红灯在修改生产代码前执行。1 项失败、93 项跳过。期望 Web 正文和版本 2，实际仍是原正文和版本 1。 [红灯日志](t176-park-resume-red.log)
- 修复后同一个测试文件 97/97 通过，包含已有保存生命周期用例。定向 `tsc`、`oxfmt`、`oxlint` 和 `git diff --check` 均退出 0。 [绿灯日志](t176-park-resume-green.log) · [类型检查日志](t176-park-resume-tsc.log)

```bash
export PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH
pnpm exec vitest run plugins/notes/test/document-session.test.ts -t '首个活动租约恢复时读取停放期间错过通知的正文'
pnpm exec vitest run plugins/notes/test/document-session.test.ts
files=(plugins/notes/src/ui/documents/DocumentSessionRegistry.ts plugins/notes/test/document-session.test.ts)
pnpm exec tsc --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable,ES2024.Promise --types node --jsx react-jsx --esModuleInterop --resolveJsonModule "${files[@]}"
pnpm exec oxfmt --check "${files[@]}"
pnpm exec oxlint -c oxlint.json "${files[@]}"
git diff --check -- "${files[@]}"
```

## 未运行的验证

本轮未运行 Electron、E2E、构建、打包或全仓检查。实际回归由 Lead 使用原 `web-share` 用例，以 Gateway 往返后桌面编辑器显示 Web 已保存正文为准。 [原用例](../../tests/e2e/workflows/web-share.spec.ts#L214)

## Modern Web Guidance

实现前执行 `search` 和 `retrieve`。参考 `deprioritize-background-fetches` 对当前视图关键读取的建议，重开正文沿用原 Engine 请求优先级。 [本地检索结果](/tmp/mwg-guide-15-1795390635683.md#L512)

`hc send t3p` 因 Core 锁所在文件系统只读退出 5，报告保存在当前工作树内。
