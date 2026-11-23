# task06 实施 Claude/Codex 历史恢复与分支
Lead t3p；worker t197；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
已批准 temp/final-audit/t197-task05-plan.md 的两切片目标及拟写文件集合（其中 index.ts 暂缓，待Lead通知package独审释放后才能写）。按该计划最小实现，复用Huhu已有CLI解析、扫描、Core原意图、helper与回执。无需另做通用历史服务或新策略框架；不把普通合格Claude/Codex行整体降为预览。
允许写：plugins/agent-cli/src/engine/history/scanner.ts、detect.ts、launch.ts、sessions.ts；history/codex-fork.ts（新）、codex-dispatch-helper.cjs；确需时 capabilities.ts、ui/history/HistoryPanel.tsx（先ModernWeb search/retrieve）；对应 test/history.test.ts、agent.test.ts、sessions.test.ts；apps/engine/test/agent-history.test.ts（新）；tests/e2e/shell.spec.ts。共享 index.ts 先准备接线说明，不碰，Lead随后通知。不要修改task23其他文件、Mail、根锁/配置/包。
原生fork可以复用本地stdio thread/fork与现有签名回执方式，但必须与实际已支持版本对齐，包含固定验收 Codex 0.170.0，不能只针对0.171新字段而使随包验收版不可用。Claude显式child UUID需要真实帮助/上游或隔离CLI证明。若某字段不支持用该版本成熟方案，不能以缺线上账号永久阻塞。Core创建与native child确认分开，不伪造ID；原请求重交不重fork。配置路径固定到被选择资料根，保留原普通启动设置与用户授权，不额外引入权限绕过参数。
只用隔离合成历史、临时HOME/资料根、假或官方离线CLI，不读/操作用户真实历史、不发线上turn。先可重复红灯再实现，只运行改动涉及的单文件Vitest（一次一个）及定向静态；worker不跑E2E、真实Core重型测试、build/package、全仓检查、不启动agent、不git。真实CLI离线协议探针若需要由Lead串行代跑，给命令与隔离脚本。
进展无需等两个切片都完成才报告：准备来源/恢复切片可先提供具体证据，整体仍继续。最终 temp/final-audit/t197-task06-final.md，列确切文件、支持行为、红绿、未运行验证及Lead E2E清单。无需再申请线上账号，外部验收用户接手；真实代码缺口仍须完成。
