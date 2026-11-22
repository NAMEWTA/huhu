# #8 Mail 数据管理 · S6b.1 与 S7.3

共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t17c
task task18.md
report t17c/report18.md

在 agent-lifecycle worktree 的 impl/huhu-issues-3-10-mail-data-settings 分支实施，已验证父基线 42d332a9083c83c3f3054afc449fd0c01f0b1421。读 #8 change 的 S6b.1、S7.3、源、规格、设计与已确认原型。原型全部已确认，无需再询问。只写 plugins/mail、tests/e2e/workflows/mail.spec.ts（如发生共同写入先告诉 Lead）和 #8 change 的证据。Engine 装配、公共 Vault 包格式、根锁仍由 Lead 写；若需公共钩子列准确最小合同。

优先 S7.3，复用可重建索引/IMAP/Gmail 缓存、存储及设置 UI。可读尺寸与范围需真实，按确认清理并防止并行/迟到同步使已清查询立即复活，保留草稿附件、本地覆盖、outbox 未知投递事实、本机认证，验证删后重启与同步重建。然后 S6b.1 核对当前 Huhu 新格式与现有收集器，实施无冲突账号子集预检/恢复、操作重复无副作用、取消无写入，限制包入口且无自动投递。按 design 的待决项，同地址只做预检并拒绝该项提交，保留已存在账号。若需求可部分提交，先明确选中的无冲突项。不要读取实际邮箱或存储内容，不使用真实服务连接。HTML/CSS/客户端 TS 修改先完成 zh-modern-web-guidance search + retrieve。Windows 测试，优先真实隔离 Engine、合成 IMAP 与打包可用的 Workbench 流程。分步提交并及时落阶段报告。
