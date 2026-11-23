# 统一在途文件写入保护

状态 `done`，待 Lead 验证。Lead `t3p`，worker `t13b`，工作目录 `agent-linux`。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task08.md) · [统一不变量设计](t14m-report01.md) · [t14r 修改前红灯](save-active-write-red.log)

## 改动

- `DocumentSession` 统一记录实际发出的正文保存和档案字段写入。记录贯穿回执、字段回读或必要对账。预检、排队快照和草稿写入沿用原队列。切 Vault 读取的 `hasUnsaved` 包含活动写入，即使缓冲等于旧磁盘正文也会入选。留稿随后等待队列并以已结算的当前缓冲和版本决定是否写草稿。队列先登记队尾，再发布写入状态，确保订阅回调追加的写入也排在当前项之后。[DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts#L323)
- 外部自动通知和兜底轮询在实际写入待定时保留缓冲。自动重载在发出前和接纳读数前检查同一状态。停放返回在保护有效时走现有留稿路径。明确重载、保留我的修改和合并仍用原读序号及基线规则，对账留在原写队列位置，手动快照和字段重基语义延续。[自动入口](../../plugins/notes/src/ui/documents/DocumentSession.ts#L657)
- 笔记、档案和文本编辑器的编码转换成功后使用会话当前状态决定自动刷新，首次读取仍可进行。文本和 JSON 冲突横幅使用 `hasUnsaved` 决定保留、合并和重载确认。档案沿用现有查询刷新包装，后续读取也在原字段队列项中完成。[NoteDocument.tsx](../../plugins/notes/src/ui/NoteDocument.tsx#L68) · [ArchivesViews.tsx](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L369) · [TextFileView.tsx](../../plugins/notes/src/ui/viewers/TextFileView.tsx#L95)
- 写请求的 HTTP 响应体读取或 JSON 解码失败时，`EngineClient` 在原有 API 错误详情上附加 `outcome: "unknown"`。会话识别此标记、Engine 直接返回的同一标记和原始传输异常。普通服务端 INTERNAL 的详情照原样传递，复读同盘后仍可明确重试。协议和错误类型沿用现有定义。[EngineClient](../../packages/workbench/src/engine-client/client.ts#L65)

## 回归

- 保留原 65 个用例及 task07 两条自动入口红灯。新增字段活动窗口回归，区分预检、已提交及字段回读待定，覆盖在提交前已开始的自动读取。新增三个真实 `EngineClient` 注入 HTTP 响应的会话回归，分别覆盖截断响应、显式未知和普通 INTERNAL 同盘重试。[字段窗口](../../plugins/notes/test/document-session.test.ts#L391) · [会话和客户端边界](../../plugins/notes/test/document-session.test.ts#L927)
- 工作台增加截断响应的读写区别及两种 Engine 错误详情透传用例。[engine-client.test.ts](../../packages/workbench/test/engine-client.test.ts#L28)
- 更新「C06 对账无法读取且缓冲等于原文时，笔记仍可保留修改并确认重载」的夹具。它现在让真实写入先落盘，再注入响应及对账读失败，因为原夹具的在途自动重载已被正确拦截。用户可见的保留、确认和后续保存断言保留。「C06 两篇笔记切 Vault 时，回执待定且已撤销的笔记也保留草稿」沿用 task07 真实切换和回读草稿用例。[未知冲突](../../tests/e2e/knowledge/session-flush.spec.ts#L149) · [双文档切 Vault](../../tests/e2e/knowledge/session-flush.spec.ts#L774)

Engine 接口仍无法在传输不明时返回原请求的最终提交状态。未知结果保留会话保护及草稿，等待明确处理。实现没有增加重放或服务端协议。

## 未运行的验证

按任务约定，本轮未运行 Vitest、类型检查、lint、构建、打包或 Playwright/Electron E2E。t14r 日志是修改前结果。Notes 单测、工作台定向客户端测试及上述两条桌面回归均待 Lead 串行执行。
