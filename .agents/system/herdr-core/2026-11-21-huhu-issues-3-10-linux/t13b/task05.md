# 保存独审三项回归：先红后修
读取 temp/final-audit/t147-report01.md 三项发现，先仅写两条门控 unit 回归和对应 UI 回归 spec；生产暂不修改，Lead 先跑红灯。工作目录仍 agent-linux，其他并行 Mail 文件勿动。
可写 plugins/notes/test/document-session.test.ts、tests/e2e/knowledge/session-flush.spec.ts；后续 Lead 确认红灯后另行投递生产阶段，可改 DocumentSession.ts、NoteDocument.tsx。不扩展其他范围。
1 keepDraft 排在旧请求之后，对账切代 g1→g2 时不得成功返回却无草稿；捕获 B，草稿真实持久，写失败拒绝，Vault 切换不应继续。
2 同代已发保存实写 A 后回执失败，load 先取样 X 尚未接纳时必须失效该取样，重新对账，保留用户 X 并不得 false clean/exit 丢稿。
3 未知冲突且缓冲等于旧基线时 NoteDocument 应可保留我的修改并要求重载确认；写 UI 回归用例。
复用现有门控、原函数，不新增基础设施。前端继续沿已完整读取的 modern-web 指南。只写不运行验证、不派代理、不发送消息；写 temp/final-audit/t13b-red05-ready.md 标明测试名与预期失败。
