# #7 文件传输任务及覆盖保护

- terminal_address `t18v`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`
- 新分支 `impl/huhu-issues-3-10-ssh-transfers`，从已解析临时本地集成候选 `0d279330e2adf48106a50411ccf40b7296d93675` 起步
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report07.md`

沿用 H6 绑定的数据源，实现确认原型的 H7.1/H7.2 可操作传输。先列出现有 Engine、SFTP 双端流、FilesPanel 与 Motty worker 的复用点，然后落地并提交第一条真实路径。优先覆盖源会话／目标快照、有限队列、返回原对象、覆盖确认与安全暂存，不能在前置核验失败时破坏源或已有目标。复用 SSH 回环测试，让用户能发起、看到稳定任务、在目标拒绝和确认后核对实际最终字节。前置完成后继续暂停、续传与跨两个回环端点。老接口的普通单文件操作须有相同行为，出错清理临时资源。核对 H7.1/H7.2 计划及批准的原型状态，明确每项可运行验收和本次剩余项。

可写 plugins/ssh、专属 e2e 和 #7 证据。按最新规范完成前端 search/retrieve。仅 Windows、本机回环、临时主机和文件目录。不要触碰真实远端、根锁、其他模块、已有独立工作树。最终交付实际本机运行结果与精确提交。

