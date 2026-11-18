# SP-4 往返保真（部分结论，2026-11-15）

方法：`scratch/ok-spike` 的 `packages/editor/spike/sp4.test.ts`（vitest，node 环境）用 OK 的 `MarkdownManager.parseWithFallback → serialize` 对 20 条 GFM 官方样本与本仓库 444 个 `.md`（`.agents`、`docs`、`examples`、`tests`、`CLAUDE.md` 等）做往返。数据：`sp-4-data.json`。

| 集合 | 总数 | 字节相等 | `normalizeBridge` 后相等 | 再往返幂等 | 崩溃 |
| --- | --- | --- | --- | --- | --- |
| GFM 样本 | 20 | 11 | 16 | 18 | 0 |
| Huhu `.md` | 444 | 295（66%） | 378（85%） | 388（87%） | 0 |

解读（**推断，需 SP-4 第二部分验证**）：
- 直接 serialize 往返 **不是**字节保真（约三分之一的真实文档会被规范化改写），所以“无编辑不写盘”不能靠 PM→Markdown 往返成立，必须靠 OK 的做法：`Y.Text('source')` 保存原始字节、无编辑不序列化（`markdownSemanticallyUnchanged`）。该性质**尚未在 `LocalDocProvider` 原型上验证**。
- 首次编辑后，文件会被整体规范化一次（OK 用户同样如此）；这是需要用户知情的行为变化，登记到 spec 待决问题。
- 未做：22 个 OK 黄金样本全量（仅取了 GFM 的 20 条与 md 夹具）；`replaceRawBody` 不进撤销栈的验证；Huhu `Tasks/`、档案、评论样本的专项分类。
**状态：往返数据部分保留；LocalDocProvider 上“无编辑 Y.Text 逐字节相等”已由 SP-6 验证（见 sp-6.md）；replaceRawBody 不进撤销栈与 22 个黄金样本全量仍未做，SP-4 不记为完全通过。**
