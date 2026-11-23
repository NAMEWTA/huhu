# Mail Graph 候选独审
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Lead t3p，worker t10n，机器wta-ubuntu。工作树agent-linux基线4ae7e7e4。读取t10d/report01.md与task01、批次决定及Mail S4.2/S8原规格。
只读审查plugins/mail/**所有未提交diff与新增graph-mail.ts/graph-send.ts/fixtures/graph.ts，不要改代码、提交或运行任何验证。t109唯一全量E2E仍跑冻结integration，禁止测试/tsc/install/build/E2E/子代理。
重点：生产入口是否真正支持既有合适Graph token路径而非仅fixture可用；新增PREAUTHORIZED_GRAPH_SCOPES与prompt=none是否符合不新增Graph授权UX决定；JWT受众/scp读取是否错误拒绝微软实际合法opaque/加密token（有疑问查微软官方文档，可读已给缓存；别申请权限扩大）。账号代/refresh/Exchange退回、原生ID和分页delta原子发布、410失败旧缓存、MIME正文附件回复、Mail.Send与IMAP/SMTP界面、Outbox一次认领和unknown重交不重发，凭据Safe独立。找确定缺陷和规格差距，不以未运行冒充失败或通过。
报告temp/final-audit/t10n-report01.md，列严重性、准确文件行号、触发路径、修法与必要定向验证；另列来源/许可台账建议及未运行验证。无需hc send，Lead主动收取，勿申请权限。
