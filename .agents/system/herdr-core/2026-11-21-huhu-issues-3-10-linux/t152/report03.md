# t152 · Notes 草稿三项关闭核对

Lead `t3p`，worker `t152`，任务 `task03.md`，执行状态 `done`。基准为 `25f5866b00d2fabdcd04c3802f083e66e24d3d83`，目标为 `agent-linux` 上 task11 的未提交 Notes 差异。复核的会话代码为 `607a15c4`，笔记、文本、档案界面依次为 `5d24946d`、`c0a16f7a`、`d32c4b3c`，会话和桌面用例为 `9cfdeb71`、`9bd83fdd`。 [派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t152/task03.md) · [原三项发现](t152-report02.md) · [实施报告](t13b-report11.md)

## 规格轴

1. **原 P2 · 保存新正文误删未处理未知草稿，原场景已关闭。** 正文成功回执保留会话内待恢复的 `outcome: "unknown"`，而且无已读草稿、无当前缓冲留稿记录时也跳过路径删除。手动、自动两种保存均断言 B 已落盘、X 的提示与持久记录保留。当前缓冲的普通稿随正文成功保存清理，载入普通同文稿的自动清理正例仍通过。 [回执清理条件](../../plugins/notes/src/ui/documents/DocumentSession.ts#L445) · [载入清理](../../plugins/notes/src/ui/documents/DocumentSession.ts#L296) · [三种保存分支](../../plugins/notes/test/document-session.test.ts#L1193)
2. **原 P3 · 恢复后确认放弃仍重现草稿，单会话原场景已关闭。** 笔记、文本／JSON 和档案的确认按钮均调用 `discardEditsAndReload()`，未确认的普通读取仍走 `load()`。恢复为当前缓冲记录草稿关联。确认放弃先读取正文和草稿，校验当前读取、编辑 revision 和磁盘序号，再在会话队列里等待删除。正文读取失败或关联草稿的 RPC 读取失败时跳过删除并显示错误，删除返回错误时保持正文、冲突和原草稿供重试。成功后才采用磁盘正文。回归覆盖同文恢复后的明确放弃、删除失败后重试、放弃普通编辑时保留无关未知稿。实际草稿记录归属和底层读取错误仍有以下两个缺口。 [读取及删除顺序](../../plugins/notes/src/ui/documents/DocumentSession.ts#L233) · [笔记](../../plugins/notes/src/ui/NoteDocument.tsx#L248) · [文本／JSON](../../plugins/notes/src/ui/viewers/TextFileView.tsx#L95) · [档案](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L397) · [回归](../../plugins/notes/test/document-session.test.ts#L1239)
3. **原 P3 · 档案记录页缺少恢复和丢弃入口，源码已关闭，真实 UI 待验。** 记录视图从同一 `index.md` 会话拿 `snapshot.draft`，在记录页直接呈现恢复和丢弃。恢复调用共享方法，未知稿恢复后进入冲突并在原页提供明确放弃入口。新增档案 E2E 分别覆盖恢复后放弃、直接丢弃，并核对持久草稿和磁盘正文。 [共享会话](../../plugins/notes/src/ui/archives/ArchiveRecordView.tsx#L12) · [档案按钮](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L435) · [档案 E2E](../../tests/e2e/knowledge/session-flush.spec.ts#L259)

### 明确放弃路径的剩余缺口

- **P2 · 明确放弃当前缓冲可删除另一工作台后来留下的草稿。** 在同一 Vault 将自动保存关闭。桌面恢复某文档的未知稿 X，让另一个 Web 工作台随后恢复同一路径、编辑为 Y 并关闭留稿。桌面仍显示 X 的冲突。此时桌面确认放弃 X，新的 `notes.draft.get` 实际读到 Y。删除条件只使用桌面会话的 `hasDraftForBuffer` 和「此路径有草稿」，没有核对 Y 是否是本次要放弃的记录。桌面、Web 共用路径对应的草稿文件，Workbench 的删除处理也不校验草稿版本，因此 Y 会被删除，另一工作台失去恢复入口。即使替换发生在读取后、排队删除前，路径删除结果相同。 [关联标记](../../plugins/notes/src/ui/documents/DocumentSession.ts#L867) · [读取并按路径删除](../../plugins/notes/src/ui/documents/DocumentSession.ts#L239) · [Workbench 身份](../../packages/contracts/src/capability.ts#L31) · [草稿命名](../../plugins/notes/src/engine/index.ts#L449) · [Workbench 删除](../../plugins/notes/src/engine/index.ts#L735)
- **P3 · 草稿文件读不出来时，确认放弃仍可能显示成功。** 恢复 X 后让其本地草稿文件暂时不可读，正文保持可读，再确认放弃并重载。Engine 的 `readDraft` 把本地读取异常转换为 `null`，RPC 成功，因而不会触发会话的读取错误保护。会话跳过删除、载入磁盘正文并清掉冲突。草稿仍留在原路径，恢复读取权限后再打开会再次出现。该场景与现有假 Engine 的删除报错回归不同，直接涉及本次读成功后才采用磁盘正文的承诺。 [Engine 草稿读取](../../plugins/notes/src/engine/index.ts#L460) · [RPC 输出](../../plugins/notes/src/engine/index.ts#L701) · [会话采用条件](../../plugins/notes/src/ui/documents/DocumentSession.ts#L243)

## 规范轴

除上述草稿记录归属与错误语义外，定向范围内未发现独立规范违规。新入口沿用共享会话、现有队列、Engine 能力和档案／笔记共用的文案与控件。Lead 对当前差异的 14 文件格式检查及 lint 已通过。 [会话队列](../../plugins/notes/src/ui/documents/DocumentSession.ts#L525) · [档案控件](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L458) · [Lead 日志](notes-draft-actions-check.log)

## 既有证据与待真实 UI 验证

- t13b 修前 4 失败、1 通过、73 未选，修后定向 10 通过、71 未选。Lead t15b 完整会话文件 81/81 通过，Notes 包类型、差异 E2E 类型以及 14 文件格式和 lint 通过。以上是已有执行证据。两条剩余缺口来自实际调用链的只读推导。 [修前日志](save-draft-actions-red.log) · [修后日志](save-draft-actions-green.log) · [Lead 日志](notes-draft-actions-check.log) · [批次记录](../../.agents/dev/changes/2026-11-19-huhu-issues-3-10/evidence/linux-final-acceptance.md#L218)
- 本轮未执行验证。桌面新增的「保存新笔记正文保留未知草稿，恢复后确认放弃才删除」和「档案记录页可以恢复未知草稿，也可以直接丢弃」待实跑。当前构建、安装包和 GUI 未验收。 [笔记 E2E](../../tests/e2e/knowledge/session-flush.spec.ts#L219) · [档案 E2E](../../tests/e2e/knowledge/session-flush.spec.ts#L259)
