# 手动保存竞态 TDD 红灯准备
Lead t3p worker t11n，agent-linux HEAD4ae，读AGENTS/dev-tdd和../t11h/report01.md。本阶段只添加明确失败回归，不修生产实现，不跑验证，不派子代理、不提交。
可写 plugins/notes/test/document-session.test.ts 与 tests/e2e/knowledge/session-flush.spec.ts。先静态核对现有会话行为契约，复用内存引擎/保存闸门：autosave false，输入A，一次flush，等待save(A)在途后输入A+B，放行原回执，断言仅A写盘，当前A+B dirty，第二次显式保存才写A+B。避免破坏退出flushForExit草稿与保存完成回执语义。
只需单测先落地并终端回告红灯准备好，报告temp/final-audit/t11n-report01.md。Lead运行单个文件红灯后给task02修复授权。若契约与此不一致先报告，勿改变契约迁就测试。E2E如时间允许写受控真实首个save响应暂停场景，不运行；不要只等延时掩盖竞态。
