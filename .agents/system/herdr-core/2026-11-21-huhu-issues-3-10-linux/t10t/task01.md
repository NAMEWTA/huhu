# 自动化旧端到端夹具迁移
Lead t3p / worker t10t task01，共享根本文件上两级。工作树agent-linux基线4ae，只写 tests/e2e/shell.spec.ts 内“自动化运行：Agent 规则经监督进程运行，运行页显示已完成、会话 id 与结果”用例及其所需导入/局部helper；不改其他用例。该文件已有Lead未提交变更，必须保留。如必须扩展fixture新文件先发消息。
按dev-debug/dev-build读当前实现、#5 T7.1/2与#4W8.3规格和现有task-journey、native-receipts夹具。实际t109第262失败：原shell脚本假claude只支持旧-p结果；当前UI显示无法派遣。从../integration/test-results/shell-自动化运行*/error-context.md和trace、保留Vault安全读取错误字段证实根因，不输出凭据。
如果确为旧夹具不支持当前原生Tasks派遣链，复用已有合成provider协议fixture或已固定离线Codex fixture，使此用例沿真实现行产品入口验规则立即运行、完成状态、实际原会话ID及结果。不能改成只测无法派遣/跳过/删测试；不能用内部setter假完成；原用户可见结果目标保持。会话ID来自真实回执而非旧固定e2e-sess-1。保证isolated Core/Vault/provider，测试清理保留首错。不触真实provider历史/账号。
当前全量E2E在integration跑，禁止任何验证（Vitest/types/e2e/build/install），只写自洽用例，不提交暂存，不派子代理。读其他模块但不改生产代码。报告temp/final-audit/t10t-report01.md，列确证根因与未运行验证，用hc send t3p回报。权限阻塞终端报告，不提权。
