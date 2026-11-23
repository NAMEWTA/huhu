# t178 task04 查询合并权限边界返工
Lead t3p；cwd integration，同task03可写范围。读取 temp/final-audit/t17c-report05.md。修复中项：tool-access 对gateway.get/capabilities.list，plugin.stateChanged对plugins.*/capabilities.* 保持原即时取消旧请求并重新查语义；home/health派生汇总仍合并，Safe立即清缓存不变。用真实QueryObserver阻塞旧请求红绿验证，不仅验证失效位。
低项：定义scope只控制本事件刷新等待及后继调度，不应因某scope结束取消其他观察者共享请求；scope中止应让该调用返回Promise及时结算并不再补刷，不伪称取消HTTP。优先复用现有取消等待工具或最小适配，避免全Vault取消作为通用scope清理。保留engine.closing显式取消、最后观察者取消传递。测试第一轮/后继轮挂起时中止等待并收尾。
补实际 EngineProvider 同端点关闭后恢复行为的单元/组件覆盖（能复用现有测试设施时，不另造框架），否则明确未验证供Lead实际用例；无E2E/构建/全仓检查，无子代理，仅单个相关Vitest。报告 temp/final-audit/t178-report04.md。
