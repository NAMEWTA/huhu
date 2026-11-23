# task14 · 日志投影返工独审

**task13 的日志净化低项已关闭。** 以 `9350f32b` 为基准，只读检查两个指定文件。复核的 blob 前缀为 `c051d5a3`（直连探针）和 `2e86a108`（E2E 收集）。 [原低项](t17c-report13.md#发现) · [返工交接](t176-report13.md)

- **直连探针。** Core stderr 只增加字节计数。启动、读屏、停止和最终失败路径只记录固定阶段、错误类别和白名单错误码。最终抛出的错误也由这些摘要生成。成功路径仍保留终端地址、Core 版本、读屏方式、尾标及清理回执等可核对字段。当前锁定 Core 的终端地址编码、已知 RPC 错误码和 `history`／`screen`／`stitched` 三种读屏方式均在投影范围内。 [错误摘要](../../packages/herdr-client/test/attach.live.test.ts#L34) · [stderr 计数](../../packages/herdr-client/test/attach.live.test.ts#L83) · [地址与版本](../../packages/herdr-client/test/attach.live.test.ts#L120) · [读屏与停止](../../packages/herdr-client/test/attach.live.test.ts#L166) · [清理记录](../../packages/herdr-client/test/attach.live.test.ts#L224)
- **桥接附件。** 实际收集函数只保存验证后的 Zod 投影。会话 ID 格式覆盖本用例的真实生成器，连接 ID、事件枚举和各层计数／时间字段与生产端一致。允许对应时间为 `null`。顶层及所有四个嵌套对象的多余字段都被剔除，非法记录整条拒绝。快照中的会话选择也经过格式检查。 [会话生成](../../plugins/agent-cli/src/engine/sessions.ts#L660) · [生产端统计](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L35) · [投影与收集](../../tests/e2e/helpers/perf-diagnostics.ts#L58)
- **独立重放。** 用 Node 24／tsx 将 t18c 关停附件的 26 条记录，经带分块 `[engine]` 前缀的内存 `PassThrough` 输入当前实际收集函数。26 条逐字段相等。另加一条合法记录的顶层及四个嵌套额外字段，均被剔除；7 条非法记录被拒绝，其他会话记录被过滤，结束后监听已摘除。 [重放输入](flood-bridge-artifacts-9350f32b/terminal-flood-bridge.json)

两文件 `git diff --check` 通过。定向类型、格式和 lint 沿用实现方记录。本次只做静态复核和内存重放，未重新启动 Core、Vitest、E2E 或构建。
