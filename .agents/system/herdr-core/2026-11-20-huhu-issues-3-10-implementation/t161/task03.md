# #5 T2.2 与 #8 批次 ZIP 的生产入口组合复核

终端 t161，任务 task03.md，报告 report03.md。冻结集成 `891c20e1c747534fa62634f7f107efcc89da7374`。验证 `33e2d23` 合入后的桌面 Tasks 停止入口和 `fbb5641` 的实际桌面 ZIP 接线。使用现存正常测试 `plugins/agent-cli/test/native-stop.live.test.ts` 与 `plugins/mail/test/draft-attachments-engine.test.ts`，真实 Windows Engine、固定 Core 与合成 App Server。核对无夹具替换授权表时桌面提交停止、返回待核实、重开后原轮终态和一次中断；桌面 ZIP 锁住 Mail 快照、其他工作台经授权边界得到拒绝、读回同一附件。按先前方式在系统临时归档运行，无新 Git worktree、真实资料、远端或额外漏洞探查。核实归档源码、实际退出和清理。报告并关闭验证 pane，Lead 负责回收审查 pane。
