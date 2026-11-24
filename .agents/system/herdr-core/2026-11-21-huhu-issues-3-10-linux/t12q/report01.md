# t12q · 快照与 HTML 修复独立审查

- Lead `t3p`，worker `t12q`，任务 `task01.md`，执行状态 `done`。[派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t12q/task01.md)
- 审查 `agent-linux` 工作树相对 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030` 的七个指定文件及其调用链。审查快照池文件的 Git blob 为 `79ff23e4e074afbd1560ae068179f2cb87fdc160`。以下发现来自静态因果链，运行证据另见下文。

## 规格发现

1. **P2 · 画板短暂不可读或清空后，恢复原内容会复用已撤销的快照 URL。** Huhu 在画板文件变更时重新读取，失败会产生 `unreachable`，零字节会产生 `empty`。这两个状态都会移除内联图片，同时保留组件的 `scene` 和 `snapshot`。观察器回收已无图片引用的 URL 后，原文件若以相同字节恢复，解析 Effect 命中相同文档和文本，导出 Effect 命中相同 scene 和主题，两处都提前返回。新挂载的图片得到的还是已撤销的 URL，可触发解码错误并要求手动重试。新增卸载、Activity 和共享图片用例均未经过这个状态往返。建议让仍存活的快照拥有者跟踪 URL 有效性，并补 `ready → unreachable/empty → ready(原内容)` 回归，断言恢复后的 URL 可用且最终关闭仍回收。[文件事件](../../../../../plugins/notes/src/ui/documents/NoteEditorSurface.tsx#L111) · [读取状态](../../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/live-doc-pool.ts#L159) · [解析与导出复用](../../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/ExcalidrawEmbed.tsx#L112) · [图片卸下](../../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/ExcalidrawEmbed.tsx#L222) · [回收](../../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.ts#L10)
2. **P3 · HTML 保存成功后可以超过 8 MiB，随后无法在应用内重开。** 源码工具可编辑上限内的 HTML，`notes.save` 按版本写入全文，写路径没有 UTF-8 字节检查。把接近 8 MiB 的文件多打几个字符并保存，写入可成功，但重开时查看器按新大小分派到超限视图，`notes.read` 也使用新上限拒绝读取。现有回归通过磁盘直接写入超限样本，只断言编码探测拒绝。建议对 HTML 保存应用同一字节上限，返回可见错误并保留原文件及缓冲区。[源码保存](../../../../../plugins/notes/src/ui/viewers/TextFileView.tsx#L75) · [服务保存](../../../../../plugins/notes/src/engine/service.ts#L578) · [读取上限](../../../../../plugins/notes/src/engine/service.ts#L605) · [查看器分派](../../../../../plugins/notes/src/ui/viewers/dispatch.ts#L27) · [服务回归](../../../../../plugins/notes/test/service.test.ts#L514)

## 既有边界与规范

- **P2 · 容量边界已有挂载前淘汰缺陷。** 若已有 30 个不同 URL 的图片绑定在文档中，第 31 个 URL 在 `setSnapshot` 之前入池。淘汰会绕过前 30 项，把刚生成且尚未挂载的 URL 撤销，随后组件仍把它交给图片。多个异步导出在 React 提交前完成时，候选也可能包含其他待挂载 URL。Huhu 的本地引用通过 `useLocalReferenceText`，不受实时协作 provider 的 30 项准入限制。该行为已存在于基线；目前的容量测试分别预先挂载全部图片或传入孤儿 URL，两者之间的挂载窗口没有覆盖。[容量与淘汰](../../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.ts#L36) · [导出后入池时序](../../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/ExcalidrawEmbed.tsx#L184) · [本地引用路径](../../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/live-doc-pool.ts#L197)
- 正常 Activity 切换保留 DOM，DOM 观察器不会因 `display: none` 清理 URL。同一轮内移动的图片及内联图与灯箱共同使用的 URL，都会在回收前再次查找文档内的消费者。正常关闭最后一个消费者后回收，池空时断开单一观察器。该观察器只接收子节点变更，在未挂载即放弃的场景仍依赖既有入池淘汰。确实仍被图片引用的快照可超过 30 项，符合现有容量测试的口径。[观察器](../../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.ts#L8) · [容量和共享测试](../../../../../packages/editor/src/vendor/open-knowledge/app/src/editor/components/snapshot-url-pool.dom.test.ts#L47) · [React Activity 文档](https://react.dev/reference/react/Activity#restoring-the-dom-of-hidden-components)
- 其余改动未发现项目规范违反。桌面工作台仅在 `img-src` 加入 `blob:`，原生 HTML 预览继续由单独的响应 CSP 和 sandbox iframe 管控。普通 UTF-8 HTML 的探测与读取沿用 Vault 的真实目标、字节上限和版本检查，`html`、`htm` 与大小写分派一致。[工作台 CSP](../../../../../apps/desktop/src/renderer/index.html#L8) · [预览 CSP](../../../../../apps/desktop/src/main/preview-protocol.ts#L48) · [预览 iframe](../../../../../plugins/notes/src/ui/viewers/HtmlPreview.tsx#L114) · [共享上限](../../../../../plugins/notes/src/shared/text-encoding.ts#L58) · [Vault 读取守卫](../../../../../packages/vault/src/read-asset.ts#L7)

## 已有运行证据

- HTML 源码旧构建 t128 报“只能探测受支持的文本文件”，t129 的三项服务回归因同一错误失败。随后 t12b 服务测试 44/44，t12d 查看器分派 5/5。绿色服务回归覆盖小文件、版本冲突及编码探测超限。[批次证据](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#L95)
- 画板 t11t 的 CSP 拒绝日志与 t11x 单改 `img-src` 的 80 像素解码结果支持首屏根因。只修 CSP 的 t12k 关闭笔记后旧 URL 仍可解码。t12m DOM 回归 24 通过、1 失败，t12n 两文件 29/29，新增移动和共享测试 t12r 5/5。这些结果覆盖各自的探针或测试条件。[批次首屏证据](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#L77) · [批次回收证据](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#L102)

## 未运行的验证

本轮按任务采用只读审查。未运行 Vitest、Electron/Playwright、构建或包验收、类型检查、lint、全量或重放验证。新候选包的 HTML 源码编辑和预览刷新、B01 画板生命周期，以及报告中的状态恢复、容量和保存上限场景仍缺本轮实跑证据。
