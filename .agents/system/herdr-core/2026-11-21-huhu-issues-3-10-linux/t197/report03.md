# t197/task03 · 后台读失败后保留组合结束时的复读

Lead `t3p`，实施者 `t197`，状态 `done`。基线 `fda247614d291625d3011b03bc6cd07aaa88df25`。 [正式任务](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t197/task03.md) · [独审 P3](t194-task06-final.md#发现)

## 修复

后台读取开始时，只有同一基线且序号紧接待复读记录，才接续这次待复读。即使后续读取报错，组合取消仍会启动一次新读取，刷新正文并清除临时读取错误。接续后仍使用现有基线与序号校验。显式重载和删除推进读序号，恢复草稿推进基线，它们产生的失效仍受保护。正文及草稿接纳继续走现有路径。 [实现](../../plugins/notes/src/ui/documents/DocumentSession.ts#L250)

回归走实际 Registry 和 DocumentSession。停放恢复先取样外部版本 2，再在组合期间延期。随后单独注入一次 `notes.read` 失败，确认临时错误已显示。取消组合后，断言多发一次读取，正文成功刷新至版本 2、错误清除且无保存请求。另三例验证显式重载失败后再遇后台失败、删除后同路径已可读、恢复草稿切换基线三种情况下，取消组合不会触发旧复读。 [回归矩阵](../../plugins/notes/test/document-session.test.ts#L2366)

## 已运行的验证

使用 Node 24.21.0、pnpm 12.10.1。

```bash
pnpm exec vitest run plugins/notes/test/document-session.test.ts -t '停放恢复的待复读在组合取消时检查后续操作'
pnpm exec vitest run plugins/notes/test/document-session.test.ts
```

- 红灯退出 1。后续后台读取失败的用例期望组合取消后共 3 次读取，实际 2 次。3 个失效保护用例通过，104 项跳过。 [红灯原始日志](/tmp/huhu-t197-task03-red.log#L107)
- 绿灯退出 0。单文件 108/108 通过，包含四条新增用例和既有草稿、组合及保存回归。 [绿灯原始日志](/tmp/huhu-t197-task03-green.log)
- 两份文件的定向严格 `tsc --noEmit`、`oxfmt --check`、`oxlint -c oxlint.json` 和 `git diff --check` 均退出 0。

| 文件 | Git blob |
| --- | --- |
| `plugins/notes/src/ui/documents/DocumentSession.ts` | `403bb6c3a21a02074956faa57581eaba727e52c0` |
| `plugins/notes/test/document-session.test.ts` | `5adc27aa364864296e8559ecea620cca21c5c381` |

## 未运行的验证

本轮未运行 E2E、Electron、构建、打包、全量测试或全仓静态检查。工作树中交付上述两文件，未暂存、提交或启动 agent。

### Modern Web Guidance

沿用 task02 已检索和读取的 `ime-safe-enter-submit` 对组合完成前保护临时输入的原则。此次变更位于会话读序号管理，复用原有组合结算回调。 [前轮指导记录](t197-task02-final.md#modern-web-guidance)
