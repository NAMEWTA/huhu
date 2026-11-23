# 未知写入草稿重开与延后外部通知回归

Lead `t3p`，worker `t13b`，工作目录 `agent-linux`。仅修改 Notes 会话单测。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task09.md) · [独审](t14y-report01.md)

- 「未知写入超时后，同文草稿跨两次重开仍可恢复撤销正文」通过真实 `Dispatcher` 的超时产生 `outcome: "unknown"`，由真实 `EngineClient` 将结果交给会话。用现有 FakeEngine 门控扣住旧请求的实际修改，并在三个真实会话实例之间复用模拟磁盘和草稿存储。第一个会话关闭后已有 X 草稿。旧请求仍挂起时重开，草稿须可见且不能被丢弃。旧 A 提交后再重开，须能恢复 X，同时磁盘仍为 A，正文请求总数为一。预计当前第一次重开会触发 `notes.draft.discard`，第二次重开无稿可恢复。普通同文草稿自动清理的既有正例保持原样。[新回归](../../plugins/notes/test/document-session.test.ts#L1543) · [普通清理](../../plugins/notes/test/document-session.test.ts#L1180)
- 「档案字段回读取样后的外部通知仍须处理：干净缓冲／本地仍在编辑」冻结实际字段回读采到的 F，外部写 B 后走真实会话通知入口。通知抵达时保留缓冲，结算后干净缓冲采用 B，有本地编辑的缓冲保留本地正文和已写入字段并进入冲突，全程不发正文覆盖。预计当前分别停在 `saved F` 和普通 `dirty`，因为活动写期间没有留下延后通知。[字段回归](../../plugins/notes/test/document-session.test.ts#L454)

Lead 可用以下筛选一次运行三个新实例及一个既有兼容正例。

```bash
pnpm exec vitest run plugins/notes/test/document-session.test.ts -t '未知写入超时后，同文草稿跨两次重开仍可恢复撤销正文|档案字段回读取样后的外部通知仍须处理：(干净缓冲|本地仍在编辑)|与磁盘相同的草稿被自动丢弃'
```

## 未运行的验证

本轮按分工未运行任何验证。以上失败为预期，实际红灯待 Lead 确认。未知草稿用例验证真实超时与跨会话恢复，存储采用既有 FakeEngine 夹具。生产代码及桌面 E2E 保持原样。
