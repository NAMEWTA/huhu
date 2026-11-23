# 未知草稿持久化与保护期外部通知

状态 `done`，待 Lead 验证。Lead `t3p`，worker `t13b`，工作目录 `agent-linux`。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task10.md) · [t150 修改前结果](save-reopen-notify-red.log)

## 改动与兼容语义

- 现有草稿 JSON、保存输入和读取输出支持可选 `outcome: "unknown"`。会话为结果未确认的写入留稿时带上标记。重开遇到同文已标记草稿时仍提供恢复入口，普通无标记同文稿沿用自动清理。恢复标记草稿会沿用其基线版本并启用冲突保护，禁止自动写回，保留现有的明确解决和丢弃动作。普通草稿继续以原格式持久化，写入不增加新日志。[草稿能力](../../plugins/notes/src/engine/index.ts#L24) · [会话载入](../../plugins/notes/src/ui/documents/DocumentSession.ts#L268) · [草稿恢复](../../plugins/notes/src/ui/documents/DocumentSession.ts#L834)
- 活动文件写入记录收到的最新外部通知，并在当前队列项结算时直接复读。通知按接收时的基线与读取序号归属，后开始的明确读取或基线切换会淘汰旧通知。相同读数不会产生额外更新，已有冲突保护继续生效。磁盘确有变化时，干净缓冲刷新，有本地编辑则保留正文及其原条件版本、进入冲突，并淘汰旧队列。整个核对只读磁盘。[延后核对](../../plugins/notes/src/ui/documents/DocumentSession.ts#L335)

## 回归与往返证据目标

- 保留 t150 的三实例回归和原普通同文自动清理正例。未知草稿用例现在额外检查存储及读回标记，分别在旧写提交前后恢复，自动保存开启时也不能写回。延后字段通知仍覆盖干净和本地编辑两支，现有显式重载正例增加在途通知验证，确认旧通知不会再做一次自动读。[会话回归](../../plugins/notes/test/document-session.test.ts#L366) · [超时草稿](../../plugins/notes/test/document-session.test.ts#L1545)
- 新增真实 Engine 能力测试，使用同一临时 Vault 保存已标记与普通两份草稿，关闭并重启 Engine 后经 `notes.draft.get` 分别读回。断言标记实际跨重启保留、普通草稿不添加标记，两个正文文件字节保持原样。[真实 Engine 重启](../../plugins/notes/test/domain-exposure.engine.test.ts#L720)

Lead 可串行运行以下筛选，再跑完整会话单测和 Notes 类型检查。

```bash
pnpm exec vitest run plugins/notes/test/document-session.test.ts -t '未知写入超时后，同文草稿跨两次重开仍可恢复撤销正文|档案字段回读取样后的外部通知仍须处理|与磁盘相同的草稿被自动丢弃|迟到的档案回读不能重基重载后的新保存|档案预检仍可自动刷新'
pnpm exec vitest run plugins/notes/test/domain-exposure.engine.test.ts -t 'desktop draft capabilities preserve an unknown outcome across Engine restart'
pnpm exec vitest run plugins/notes/test/document-session.test.ts
pnpm --filter @huhu/plugin-notes typecheck
```

## 未运行的验证

按任务分工，本轮未运行单测、真实 Engine 往返、类型检查、lint、构建、打包或 Playwright/Electron E2E。t150 的结果对应修改前。桌面用例保持原样。
