# t194/task07 Notes 组合结束后复读复审

Lead `t3p`，审查者 `t194`，状态 `done`。基线 `fda247614d291625d3011b03bc6cd07aaa88df25`，候选 `3cf40143c4234dcaa7083e0bc508fb39053a3e02`。工作树和候选提交的两份文件均与冻结 blob 一致。 [原 P3](t194-task06-final.md#发现) · [实施报告](t197-task03-final.md)

**task06 的 P3 已关闭，未发现新增缺陷。** 已安排的组合结算后复读跟随后续同基线、连续序号的后台读取。即使后续读取单独失败，组合结束仍能重新取样。新的 guard 仅移动待复读标记，并沿用原先的基线、序号和请求接纳判断。 [连续序号](../../plugins/notes/src/ui/documents/DocumentSession.ts#L252) · [结算后复读](../../plugins/notes/src/ui/documents/DocumentSession.ts#L824)

## 核对结果

- 独立内存对照使用实际 Registry 与基线、候选两版 DocumentSession。第一次读到版本 2 被组合延期，再让两次连续后台读失败，磁盘最终为版本 3。取消组合后，基线停在原文和错误，候选新增一次读取、采用版本 3、清除错误。提交本地文字的同一时序下，候选新增一次冲突核对，保留本地正文和原条件写版本，识别外部冲突。这两个场景无正文保存。
- 组合结束时若后续读仍在途，候选重新取样版本 4，放行此前已取样的版本 3 后仍保持版本 4。工作状态和旧读校验继续由现有路径决定。 [正常复读](../../plugins/notes/src/ui/documents/DocumentSession.ts#L860) · [脏缓冲冲突核对](../../plugins/notes/src/ui/documents/DocumentSession.ts#L873)
- 显式重载和删除造成的序号间隔使旧标记失效，即使之后再遇后台读也不会接续。草稿恢复变更基线，同样使旧标记失效。新回归分别验证显式重载失败、删除后路径又可读及草稿恢复条件下，结束组合不重新发布旧请求。 [删除失效](../../plugins/notes/src/ui/documents/DocumentSession.ts#L837) · [草稿基线](../../plugins/notes/src/ui/documents/DocumentSession.ts#L990) · [四项回归](../../plugins/notes/test/document-session.test.ts#L2366)

## 证据与范围

| 文件 | 冻结 blob |
| --- | --- |
| `plugins/notes/src/ui/documents/DocumentSession.ts` | `403bb6c3a21a02074956faa57581eaba727e52c0` |
| `plugins/notes/test/document-session.test.ts` | `5adc27aa364864296e8559ecea620cca21c5c381` |

已查阅基线红灯，取消后后台读取次数实际为 2，期望为 3，三项失效保护当时均通过。冻结候选在 Node 24.21.0 由审查者复跑 `pnpm exec vitest run plugins/notes/test/document-session.test.ts`，108/108，退出 0。独立内存对照与 Git 差异检查同样退出 0。未运行 E2E、Electron、构建、打包或全仓验证，未改动业务或测试、未启动 agent。 [红灯](t197-task03-red.log#L118) · [实施绿灯](t197-task03-green.log#L5)
