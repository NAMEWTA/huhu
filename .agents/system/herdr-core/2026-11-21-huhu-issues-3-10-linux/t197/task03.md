# task03：后续后台读取失败仍保留组合结束后的复读
Lead t3p；cwd integration；当前 HEAD fda247614d291625d3011b03bc6cd07aaa88df25。
先读 temp/final-audit/t194-task06-final.md 的 P3。只改 plugins/notes/src/ui/documents/DocumentSession.ts 与 plugins/notes/test/document-session.test.ts。真实 Registry/Session 失败回归：一次外部读取在组合中延期，随后同基线后台读取失败，取消组合后必须重新读盘并清除错误。保留显式重载、删除、基线切换的失效保护；不可单纯删掉序号保护。
复用此前已读取的现代Web指南及既有机制，必要时补查。先红后绿，单个 Vitest 文件、定向类型静态允许。不得 E2E、构建、打包、全仓检查、git 写操作或启动 agent。Lead 正在打包旧已构建输出，不使用你的新源码，互不覆盖。
报告只写 temp/final-audit/t197-task03-final.md，列原始日志、blob、未运行验证；不必 hc send，Lead 主动读取。
