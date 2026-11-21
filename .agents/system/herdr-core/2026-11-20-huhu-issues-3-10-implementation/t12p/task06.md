# #9 P4.2 · Git 认证修复后恢复

终端 t12p，任务 task06.md，报告 report06.md。在既有 safe-personal 工作树的 Versioning 分支从 P4.1 `f5a92e68df2ba655e9c888ddb9e61460cd69a4aa` 继续。依据 `.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P4.2-git-resume.md` 实现后端职责：按所属 HTTPS 目标与认证版本解释暂停/重试，修复当前目标的认证后重新接受原同步配置，旧版本迟到/其他仓库或 Safe 解锁不触发重试。有确定下一次发起条件后再恢复，限制并发并实证 HTTP 次数。只读保持原因，旧 Safe 引用现有可用行为仅保留过渡路径，移除 Safe 解锁事件对 Versioning 自有恢复的依赖。用现有 real Engine + Windows Git 合成回环 HTTP/HTTPS 比较认证拒绝、锁/解锁及修复，确认合成数据清理。前端原型待确认，此轮不改 UI、不访问真实账户、远端、生产 Vault、不写其他 worktree、不改根锁、不新开 worktree。保留源码提交、实际输出和报告，关闭临时验证窗格。
