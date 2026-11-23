# 原生恢复的前台取消与交付前再核验
身份t86，Lead t3p，integration基线dbe58665。Mail task04已提交且t99完整20/20与Mail types通过，冻结Mail。读t93/report02两处P2，先以低成本受控测试复现，再修复。
可写sessions.ts、launch-binding.ts、sessions.test.ts、Automations service.ts和service.test.ts，必要terminal-environment.ts。禁止native-pty.ts、interactive-environment.ts、native/**（t8k持有）、UI、index/公共契约、Mail、SSH。不提交/不派子代理/不重型。
1) Core连接/hello等待或broker.hostArgv就绪前取消，记录已落launching但无attempt：保留原request并终结为可证未发送的取消/失败，不留下锁Space和永远unknown。2)首次核验成功的前台路径在凭据/规则队列等待时cancel，未写私有帧时要同延期路径保存取消事实、原sessionID与清理待办，Automations不得先unknown再把取消当失败。3)取得候选后、领取放行前Core换代或唯一候选/绑定变化时，实际broker.start前重新只读核验原Core/host绑定且零交付。不要第二次terminal.run，不把新Core旧host存在当可继续，不在凭据lease外保存明文，不因网络核验等待绕过取消/到期。
用现有fake broker/Core/lease测试上述窗口，检查持久状态重开、Space可删、零私有帧、取消权与清理。保持t97真实一次执行断言。只运行相关单文件；库目标沿ES2023，不再引入Promise.withResolvers。交report05后冻结，Lead types与真实CLI复验。
