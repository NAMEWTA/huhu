# #9 P0.2 修复本机初始回收记录的中断恢复

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t79
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t79
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t79/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t79/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/credentials，分支 impl/huhu-issues-3-10-credentials，当前 `86f810e8ba42d43acb6e300737647dca85051741`。

按 dev-build/dev-verify，读 P0.2、t5t/report01、t4z/report02。先用 t4z 的独立 probe 复制写入前与截断退出 75/76，或等价实际 Windows 子进程验证。修复私有 initially-unbound 初始化，使开始创建但未完成的记录可重试，已有作用域缺失、损坏、错误 scope 仍保守。评估先在同级临时目录写完整证明再一次发布为规范作用域目录的方案，也可复用现有原子写并以可验证的初始化阶段恢复。开始副作用前的证明要独立可核，不能推断已建立绑定的记录为空。考虑应用在结束写锁后再开、重试 I/O 错误与弃留暂存的边界。

仅写私有 `packages/kernel/src/credentials` 及定向测试/夹具。不写 Engine、根锁或 Vault 包收集器，不增加依赖。使用精确 SHA、Git 归档和隔离合成保护后端。Windows 回归重放 71–76、复制库重开后清空并保留相邻待重配，原库仍可认证，独立只读不访问保护材料。同锁依赖可沿用 t5t、t4z 报告中的隔离链接方法。

禁止远端写入、改用户工作区、使用真实凭据、增加 worktree 和自行派遣。提交并记录精确 SHA、红绿和验证证据。报告发布前工作树干净，关闭完成且无后续用途的命令 pane。
