# 原生历史共用列表和认领回归修复
身份 t1fp/task02.md，Lead t3p，工作区/worker限制同task01。只修 t1g0/report01.md 两项直接回归，前四项修复已独审通过且Lead真Core/真CodexC01全过，不重新扩大实现。
1 Codex列表possiblyActive必须与精确认领一致按真实来源区分不同profile的同UUID，保留正确active优先。2 Pi独立来源同ID并发认领不得互阻，恢复原cwd/文件粒度，不能减弱同一来源并发保护。
写低成本单文件回归，核对原来阻塞再修；Lead统一typecheck，worker不跑重型。勿改Mail/RGL/元数据。保留现有格式（Lead已oxfmt过）。完成冻结后report02.md，若只读temp/closeout-release/t1fp-report02.md。
