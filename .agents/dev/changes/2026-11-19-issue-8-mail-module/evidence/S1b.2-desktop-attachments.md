# S1b.2 桌面草稿附件

已确认的 Mail 原型演示从写信添加、去重、移除和重新打开附件。四项原型资源与 `7d17ffa6` 一致，确认指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。 [原型确认](../prototype-review.md) · [规格](../spec.md#workspace) · [任务](../tasks/S1b.2-managed-attachments.md)

## 桌面接线

现有 `pickOpenPath("file")` 只返回路径。`openVaultFile` 和 `previewGrant` 面向 Vault 内已有文件，整包导入专用于 ZIP。桌面 Main 与 Engine 的 utilityProcess 通道已有就绪和关闭消息。此工区未找到已授权给 Mail 的本地文件选择及字节入口。 [preload](../../../../../apps/desktop/src/preload/index.ts) · [Main](../../../../../apps/desktop/src/main/index.ts) · [Engine 入口](../../../../../apps/engine/src/main.ts)

Lead 从 `@huhu/plugin-mail/desktop-attachments` 导入 `DesktopDraftAttachmentHost`，在 `window.huhuHost.mailDraftAttachments` 暴露两个方法。 [强类型契约](../../../../../plugins/mail/src/desktop-attachments.ts)

| 方法 | 约定 |
| --- | --- |
| `selectAndAdd({ operationId, vaultId, draftId, expectedRevision })` | 核对可信主 frame、活动桌面 Vault、可写状态及 Engine 实例。由 Main 打开单文件系统对话框，只消费这次实际选中的常规文件。选择成功后复核 frame、Vault 和 Engine 实例，确认可读文件及上限，再把有界 `MailAttachmentSource` 通过受信宿主边界交给该 Vault 的 `MailDraftAttachments.addAttachment`。取消选择直接返回 `cancelled`，不调用附件服务。成功仅回传修订和附件元数据。失败按类型返回可显示原因，绝对路径、文件句柄和字节留在受信宿主侧。 |
| `cancel(operationId)` | 作用域为创建操作的窗口、frame、Vault 与当前 Engine 实例。取消、窗口消失或实例切换时撤销在途授权，通知读取及导入停止。系统对话框有迟到结果时丢弃。遇到提交与退出竞态，已提交的修订由用户下一次打开草稿时读回。 |

Main 可沿用 `dialog.showOpenDialog`，Engine 侧复用已经存在的 `mail.draftAttachments` 服务。使用当前的 Main／Engine 私有宿主通道承载所选文件的限量、可撤销流。渲染层只发送上述四项标识和取消 ID。禁止将选择转换为对桌面 bearer 或 Web 开放的读取 RPC。现有服务继续在打开源字节前校验草稿修订，按完成读取的内容摘要去重，并由原子草稿写发布引用。移除走桌面专用且不可外部开放的 `mail.drafts.removeAttachment`，继续用既有快照串行边界和发件箱引用保护对象回收。 [附件服务](../../../../../plugins/mail/src/engine/drafts.ts) · [整包维护快照的入口](../../../../../apps/engine/src/boot.ts)

状态映射按 `attachment-too-large`、`draft-attachment-limit`、`attachment-source-missing`、`attachment-import-interrupted`、`VERSION_CONFLICT`、无权限／不可用状态分别返回 `too-large`、`draft-limit`、`source-missing`、`interrupted`、`conflict`、`unavailable`。其余失败用 `failed`，例如内部读取错误。未接入宿主时写信区显示当前桌面宿主暂不支持选择附件，已有附件仍能显示。Web 与只读 Vault 上没有附件写入操作。

## 整合后的桌面验证

Main 在系统选择前后核对主 frame 来源和当前 Engine 实例，把本次选择的绝对路径、文件身份和草稿版本发送给随应用启动的 utilityProcess。单次 MessagePort 回传附件元数据，在取消时关闭。Engine 在核对草稿版本后才打开文件并核对文件身份，按字节摘要纳入同一受管附件服务。路径和原始字节留在两个受信桌面进程。 [选择处理](../../../../../apps/desktop/src/main/mail-attachment-picker.ts) · [Engine 读取](../../../../../apps/engine/src/mail-desktop-attachment.ts)

Windows Electron 44.9.1 的 Playwright 通过实际 Mail、preload、Main 和 Engine，仅替换系统对话框的返回值。取消时无附件对象，带路径的渲染请求被拒绝。第二次选择后移走合成源文件，重开草稿仍可看到并删除附件，最后一个引用移除后对象回收。真实操作系统选择对话框界面由 Electron 提供，本次自动化记录的是进程间链路。 [桌面测试](../../../../../tests/e2e/workflows/mail.spec.ts) · [日志](/D:/Document/code/huhu/temp/issue-baseline/mail-desktop-attachments.log)

切换 Vault 停止 Engine 时立即撤销同一代的附件端口，Engine 进入关闭流程时同步取消读取。独立探针在等待结果时开始停止，旧端口随即关闭，新一代引擎未收到选择。真实导出测试在对象已写但草稿取消或写入冲突的窗口发起 ZIP 导出，恢复后的 Vault 只有已提交的共享附件。停用 Mail 后重新导出同样只保留已提交引用。 [端口回归](/D:/Document/code/huhu/temp/issue-baseline/mail-attachment-endpoint-stop.log) · [ZIP 恢复回归](/D:/Document/code/huhu/temp/issue-baseline/mail-attachment-package-privacy.log)

## 重跑

用现有 Windows 固定 pnpm 12.10.1 运行 Mail 工区测试。Edge 探针只在测试页面安装可撤销的 `huhuHost` 选择桥。选择源由测试侧限定为隔离临时目录的合成文件，真文件字节进入现有 Engine 附件服务，HTTP 移除调用进入真实分发器。 [复跑方式](S1-workbench.md#重跑) · [Edge 探针](S1-workbench/workbench-renderer.test.ts) · [Engine 回归](../../../../../plugins/mail/test/draft-attachments-engine.test.ts)

| 场景 | 断言 |
| --- | --- |
| 草稿保存失败、取消 | 保存失败时未调用宿主，正文留在原编辑器。保存成功后选择取消，附件导入和源文件打开次数均为 0，没有附件对象。焦点回到「添加附件」。 |
| 同字节重复选择、超限与源文件消失 | 两个不同名称、同样字节的文件只留一个引用，且保留第一次上传的文件名和修订。单文件超过 25 MiB 时没有打开源文件。源文件丢失给出明确反馈，正文和修订保留。 |
| 关闭、重开、恢复及移除 | 移走源文件后关闭并重新打开原草稿，仍可读到一致的受管字节和 SHA-256。临时删除受管对象，状态显示「字节缺失」。选取同字节的文件可以恢复对象。移除后回收未被引用的对象，焦点回到添加按钮。Windows Engine 重启、打包恢复、共享引用和发件箱引用另有回归。 |
| 退出与迟到选择 | 窗口离场检查取消悬挂的选择。重开同一草稿后再释放旧响应，没有新导入、对象、修订或界面消息。附件路径的 SMTP DATA 增量为 0。 |
| 授权 | HTTP 移除需要既有桌面和可写 Vault 授权，Web、CLI、只读 Vault、过期修订及附带绝对路径的输入均被拒绝。 |

[390px 写信附件截图](S1-workbench/mail-attachments-390.png)
