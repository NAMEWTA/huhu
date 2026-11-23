# t152 · 草稿身份与读取失败关闭复核

Lead `t3p`，worker `t152`，任务 `task04.md`，执行状态 `done`。相对 `ce3a3b7b82410ea1e25cb2955df4140fa2b934bc` 审查四个 Notes 文件的实际差异。HEAD `9252eeeab04a59402d8c1129a35cd84e587d4c6b` 的中间提交仅涉及验收文档。复核时源码和测试的工作树哈希依次为 Engine `b314d887`、会话 `a3032b03`、会话测试 `412677d7`、Engine 测试 `ac0cd666`。 [派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t152/task04.md) · [上次发现](t152-report03.md) · [实施报告](t13b-report12.md)

## 规格轴

1. **原 P2 · 确认放弃会误删另一工作台的新草稿，已关闭。** 恢复草稿时绑定当初读到的版本，留稿成功时绑定此次写入回执的版本。明确放弃固定该版本后复读。确认前若已换成 Y，会话保留 Y 并显示其恢复入口。若读取 X 后才换成 Y，Engine 排队执行时对当前草稿做版本比较，在同一个同步处理段内完成比较与删除。版本不符返回 `VERSION_CONFLICT`，正常工作台 EngineClient 会保留错误码，会话复读时仍以初始版本 X 为删除目标。新 Workbench 记录的内部 ID 使同毫秒、同正文的替换也有独立版本。会话两种替换时序和真实 Engine 的过期拒绝、匹配删除均已有通过证据。 [绑定恢复版本](../../plugins/notes/src/ui/documents/DocumentSession.ts#L892) · [绑定留稿回执](../../plugins/notes/src/ui/documents/DocumentSession.ts#L659) · [确认与重读](../../plugins/notes/src/ui/documents/DocumentSession.ts#L238) · [Engine 写队列](../../plugins/notes/src/engine/index.ts#L418) · [内部记录 ID](../../plugins/notes/src/engine/index.ts#L734) · [条件删除](../../plugins/notes/src/engine/index.ts#L761) · [错误码传递](../../packages/workbench/src/engine-client/client.ts#L71) · [会话用例](../../plugins/notes/test/document-session.test.ts#L1307) · [Engine 用例](../../plugins/notes/test/domain-exposure.engine.test.ts#L742)
2. **原 P3 · 草稿文件读失败时明确放弃假成功，已关闭。** Engine 仅把 `ENOENT` 当作无草稿。文件读取、JSON 或记录解析失败会传出。确认放弃收到草稿读取错误时停在删除与采用磁盘正文之前，保留当前缓冲、冲突和错误供重试。真实 Engine 用例用目录占据草稿文件位置，断言明确放弃失败、编辑缓冲和正文保留，复原记录后可重试。关联稿已正常删除则继续载入正文。若稿子在读取后被删，条件删除返回冲突，复读缺失后也会继续。 [Engine 读取](../../plugins/notes/src/engine/index.ts#L467) · [确认失败分支](../../plugins/notes/src/ui/documents/DocumentSession.ts#L249) · [失败重试和正常缺失](../../plugins/notes/test/domain-exposure.engine.test.ts#L763)

直接兼容核对通过。旧草稿可省略内部 ID，仍从原字节计算版本。普通 Workbench 调用省略 `withVersion` 时沿用读取和保存响应，外部读取继续带版本，内部 ID 只存在于存储格式。普通同文稿清理、正文保存后的清理及草稿横幅丢弃都使用已知草稿版本。移动继续保留有效草稿的内容，草稿不可读时沿用原来的跳过行为。当前四文件范围内未发现直接回归。 [能力 schema](../../plugins/notes/src/engine/index.ts#L368) · [读取及保存兼容](../../plugins/notes/src/engine/index.ts#L716) · [移动](../../plugins/notes/src/engine/index.ts#L487) · [普通清理](../../plugins/notes/src/ui/documents/DocumentSession.ts#L303) · [显式丢弃](../../plugins/notes/src/ui/documents/DocumentSession.ts#L911)

## 规范轴

定向范围内未发现独立规范违规。版本复用现有字节版本与 `expectedVersion`，状态保留在共享文档会话，实际删除用既有 Engine 写入队列。首次格式检查有两处问题，Lead 格式修正后，四文件复查和 lint 通过。 [版本与队列](../../plugins/notes/src/engine/index.ts#L418) · [格式复查](notes-draft-identity-recheck.log)

## 既有证据与待真实 UI 验证

- t13b 修前会话 2 失败、Engine 2 失败。修后完整会话 83/83，Engine 定向 4/4。t15f 的 Notes 与差异 E2E 类型检查通过。两处格式修正后，t15g 四文件格式与 lint 通过，真实 Engine 完整单文件 11/11，包含 CLI/MCP 启用前默认关闭、授权、撤销、重启和外部版本兼容。 [会话红灯](save-draft-identity-session-red.log) · [Engine 红灯](save-draft-identity-engine-red.log) · [会话绿灯](save-draft-identity-session-green.log) · [Engine 定向绿灯](save-draft-identity-engine-green.log) · [Lead 类型](notes-draft-identity-types.log) · [Lead 完整 Engine](notes-draft-identity-recheck.log)
- 本轮只读复核，未运行验证。两项源码关闭，待当前候选真实工作台和桌面 E2E 验收。 [笔记与档案 E2E](../../tests/e2e/knowledge/session-flush.spec.ts#L219)
