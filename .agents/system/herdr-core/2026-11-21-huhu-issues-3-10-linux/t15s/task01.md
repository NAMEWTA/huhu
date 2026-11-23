# t15s/task01 — 固定候选间歇启动失败只读诊断

Lead t3p；终端 t15s；工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux。角色 gpt-6.2-astra/high。读取 topic/manifest；本次只读业务和测试代码，禁止子agent、测试、构建、类型检查、修改源码、杀进程、连接/驱动当前测试浏览器。可写唯一路径 temp/final-audit/t15s-report01.md。完成用 hc send t3p 回报。

当前候选05a748b61eaa6dddaaa86aa648a2e68dd385d085，worktree必须保持干净。Lead t15n正在串行E2E，t15r已排队单个Notes退出用例复现，t15q排队最终同包组；不要启动额外验证。SSH暂停。

两次启动失败：
1) temp/final-audit/targeted-notes-05a748b6.log 31通过1失败，session-flush.spec.ts:1206 用例在1211 engineReady未找到engine-state，尚未开始quit断言。原JSON在 /home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/targeted-notes-05a748b61eaa6dddaaa86aa648a2e68dd385d085.kmitLe/result.json。共享test-results被后续组清理，Notes trace没有保留，Lead未声称检查过。
2) temp/final-audit/targeted-failed-05a748b6.log前三项通过，第4 compact-submit.spec.ts:97撤销空评论在engineReady超时60s。trace/error-context已保存 temp/final-audit/failed-artifacts-05a748b6/knowledge-compact-submit-H05-撤销到空，点击发表不提交评论/。trace最终是openApp firstWindow返回后engineReady挂起，无页面snapshot。

可读tests/e2e/helpers/launch.ts共享USER_DATA_ARG、session-slow-bridge.ts、desktop启动/导航/退出流程。检查真实原因候选（不先假定共享profile或产品退出bug），区分证据/推断。Lead观察2026-11-23 03:24附近内存available约26GiB，当前测试独立根/tmp/hc-t.dmf2vx，Electron PID11791及GPU/network仍在，没有看到renderer（仅瞬时观察）。不可删除其目录或操纵该进程。当前测试可能继续；以文件/只读进程状态核对，不轮询等待。

要求给出最小诊断与复现建议、需要新增的日志/前置健康检查位置、实际产品缺陷或测试驱动缺陷证据。若现有证据不足明确写缺哪项，不能仅延长timeout或跳过断言。可检查Electron启动stderr/trace现有保留信息。绝不触碰用户真实Vault/凭据/历史。报告附具体路径行号和未运行验证。
