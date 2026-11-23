# 原生取消修复定向复核
Lead t3p，worker t9b，工作目录integration。固定基准6874c619，目标18aa8c6b，只读本提交六文件和直接调用者。当前Mail工作树其他人正在改，排除。
复核t93/report02.md两项P2是否关闭，读t86/report05.md。重点：Core连接/hello/broker就绪前取消无attempt不再阻塞Space；前台等待lease取消与延期取消沿原请求持久cancelled并清理原host；进入lease后即时核对原Core唯一host/进程绑定，迟到结果不交付，保持一条terminal.run和一次私有帧。
Lead t9g在18aa8c6b三模块类型通过、sessions52/52、automations42/42、真实CLI/MCP2/2；日志 /home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/native-cancel-recheck.log。只针对本次修复实证和直接回归，不重新审计整个Agent/provider。可按需单Vitest验证，不修改业务/测试，不跑重型/实程。报告规格/规范两轴，指出具体缺陷输入证据，未验证单列。写本目录report02.md。无子代理，完成冻结等Lead。
