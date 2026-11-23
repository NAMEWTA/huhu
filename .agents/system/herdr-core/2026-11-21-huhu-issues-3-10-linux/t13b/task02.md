# 保存独审三边界的红灯
Lead t3p worker t13b，agent-linux HEAD4beb7eae。前任务t13m50项通过，t13n类型与t13r lint通过。读取 temp/final-audit/t13p-report01.md。
本阶段只写真实回归不修生产：1 手动X→保存A请求在Engine写前阻塞→撤销X→重载仍X同版本→放行原请求使磁盘A。不能持续saved/hasUnsaved false或flush untilClean成功后退出丢X，必须重新核对磁盘而不重放原请求、不静默替换用户正文。2 档案已有index.md带版本更新字段，在请求前外部移走index，保留目录，旧请求必须拒绝并不重建文件。3 保存A已写磁盘但ACK门控时撤销原X，不得显示saved并禁用第二次明确保存；下一笔明确X保存正常排队。
可写 plugins/notes/test/document-session.test.ts、plugins/notes/test/archives.test.ts；现有FakeEngine必要门控可用，不改生产、不跑任何验证、不派子代理、不提交/reset。设计期待要保护新基线与旧请求真实副作用，不通过弱化原50项解决。
写完 temp/final-audit/t13b-red02-ready.md，说明用例名及最小修复建议，等待Lead红灯后task03实施。禁止hc send。