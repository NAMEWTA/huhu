# 迟到实际写入对账

状态 `done`，待 Lead 验证。Lead `t3p`，worker `t13b`。实现范围为 `DocumentSession.ts`、`ArchivesViews.tsx` 和 `document-session.test.ts`。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task04.md) · [t13x 设计](t13x-report01.md)

## 行为

- 已发的正文写入跨基线返回时，在原串行槽里直接复读磁盘。复读核对基线代数、磁盘进度及读取序号。新基线期间若又有一次重载，旧读数会丢弃并按最新基线复读。复读与当前已接纳磁盘一致且结果已确认时，原样保留状态、草稿及当前基线的合法队列。旧操作返回 `false`，不会重发或触发旧保存回调。[DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts#L364)
- 磁盘偏离时切代，保留缓冲和合并祖先，接纳磁盘正文和版本用于比较并阻止隐式覆盖。结果不明或复读失败时继续保护缓冲，即使它等于最后确认的磁盘正文。退出等待对账结束后按当前稿和版本保存草稿，草稿失败可重试。明确重载、保留我的修改或合并可重新读取并解除保护。草稿恢复的条件写版本与最后观察的磁盘版本分别保留。[对账结果](../../plugins/notes/src/ui/documents/DocumentSession.ts#L394) · [排空与退出](../../plugins/notes/src/ui/documents/DocumentSession.ts#L553) · [解决冲突](../../plugins/notes/src/ui/documents/DocumentSession.ts#L673)
- 档案调用方在预检之后用 `submit` 包住实际更新。预检阶段过期会跳过更新及对账。已发更新跨代时，无论响应返回、更新后失败或后续字段回读过期，均从同一队列槽对账。档案页复用冲突提示、保留我的修改和确认重载动作。[字段队列](../../plugins/notes/src/ui/documents/DocumentSession.ts#L447) · [档案入口](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L381)

## 回归

原有断言保留。字段用例改用 `submit` 表达实际请求的边界，原红灯进一步断言退出草稿使用确认后的磁盘版本。新增十个用例，覆盖以下行为。

- 已发档案更新跨代后成功或落盘后失败，当前缓冲保留，新基线到对账前已排队的正文和字段操作均退出，后续输入和自动保存不能覆盖，退出留稿。传输结果未知且复读内容相同时也继续保护。[字段回归](../../plugins/notes/test/document-session.test.ts#L390)
- 旧成功回执未改变最新磁盘时，合法的下一笔保存仍使用新基线版本。跨第二次重载时废弃旧读数。另一条用例在对账期间启动并扣住重载，确认对账发现偏离后，迟归的重载读数不能替换缓冲。[读数时序](../../plugins/notes/test/document-session.test.ts#L700)
- 复读失败时拒绝干净结算，退出草稿失败可重试，明确重载恢复后解锁。保留和合并分别验证下一次明确保存，合并检查采用对账前的祖先。恢复草稿后无变化的复读仍保持草稿旧版本的条件写保护。[恢复与冲突解决](../../plugins/notes/test/document-session.test.ts#L808)

## 接口边界

Engine 接口在传输失败时无法提供原写入的最终状态，也没有提交屏障。一次相同读数不足以解除未知结果的保护，会话等待用户明确处理。正文 `notes.save` 的 `VERSION_CONFLICT` 来自条件写拒绝。档案更新在文件写入后还可能因身份记录的条件写报同名错误，因此已发字段更新的异常仍走对账。复读是一项观察，后续用户授权的写入继续由 Engine 校验版本。

## 未运行的验证

按任务约定，本轮未运行任何验证。新增及现有 Vitest 用例、模块及全仓类型检查、lint、构建、打包与 Playwright/Electron E2E 均待 Lead 串行执行。档案页冲突动作使用现有组件，交互仍待真实界面验证。
