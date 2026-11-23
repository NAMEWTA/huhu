# t17c task05 查询洪流修复独审
Lead t3p；cwd integration。只读审查 t178-report03.md 和 workbench query.ts/react.tsx/engine-client.test.ts 当前diff。实际1000事件触发1002请求及退出确认框的证据见 task-scroll-diagnostic-4a54f0a9.log；单元24项通过，1000事件最终版1000、2请求。
核对串行合并最后变更、错误/取消/缓存移除重建/不同Vault/不同输入/作用域中止与同端点恢复、观察者取消信号影响。尤其库Promise结算和失效复位竞态、调用方返回Promise是否挂住、立即安全锁定及权限撤销不延迟。检查真实入口是否确有测试或仅代码推断，指出范围不足。顺带核对perf窗内输入断言低项关闭。不要改代码，无子代理，仅可跑单个相关Vitest，不跑E2E/构建/全仓检查。报告 temp/final-audit/t17c-report05.md。
