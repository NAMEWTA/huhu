# 紧凑编辑器两项修复静态复审

任务 `t10j/task02.md`，Lead `t3p`，工作树 `agent-linux`，基线与 HEAD 均为 `4ae7e7e4`。本轮检查 [上一份报告](t10j-report01.md) 的两项 P2 和对应工作树改动。

## H05 · 空稿提交

**原 P2 的两条误通过路径已关闭。** 点击与 `button.disabled` 检查在同一个浏览器回调中。提交结束后检查按钮恢复可用，并要求任务模块没有 alert。`CommentComposer.submit` 会把 `flush` 或读稿抛出的错误交给 `onMessage`，模块把这类错误渲染到新断言覆盖的区域。两条用例都用新建任务的 ID 调用 `tasks.read` 检查持久化人类评论，同时保留请求和 UI 断言。删除用例还要求点击前 source 为旧文，点击后变为空。 [点击与结果断言](../../tests/e2e/knowledge/compact-submit.spec.ts#L25) [撤销用例](../../tests/e2e/knowledge/compact-submit.spec.ts#L92) [删除用例](../../tests/e2e/knowledge/compact-submit.spec.ts#L112) [生产提交](../../plugins/tasks/src/ui/TaskDetail.tsx#L250) [错误反馈](../../plugins/tasks/src/ui/TasksModule.tsx#L205) [任务读接口](../../plugins/tasks/src/engine/index.ts#L584)

**请求观察时长仍有一个缺口。** 第 27 行的 800 毫秒超时从注册监听时开始，早于第 33 行点击。如果浏览器操作排队接近 800 毫秒，点击后的请求观察时间会缩短，甚至在点击前结束。后续 alert、持久化和 source 断言仍提供各自的证据。若验收需要完整观察点击后的 800 毫秒，可先用 `page.on("request", …)` 收集请求，点击完成后才启动观察计时，并在 `finally` 移除监听。 [观察窗口](../../tests/e2e/knowledge/compact-submit.spec.ts#L25)

## OP-D18 · 原始失败保留

**原 P2 已关闭。** 主操作和断言抛错时记录失败状态，再原样重抛。此后若 probe 读取或 JSON 附加失败，会尝试附加单独的诊断；诊断附件自身失败也保留原异常。内层 `finally` 始终尝试释放 handle，有主异常时释放失败也不会覆盖它。主操作成功时，probe 和释放失败仍能使测试失败。此结论覆盖 probe 清理路径。 [主异常与诊断处理](../../tests/e2e/knowledge/editor-compact-commands.spec.ts#L96)

## 未运行的验证

仅复核源码和工作树差异。未启动应用、运行测试、类型检查、lint、构建或安装。

Lead：接受两项P2已静态关闭；另将请求观察改为page.on提前注册，点击完成后观察800ms，finally解除监听。候选仍待定向E2E，不签运行通过。
