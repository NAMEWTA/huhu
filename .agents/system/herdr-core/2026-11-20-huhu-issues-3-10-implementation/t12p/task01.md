# #9 P1.1 当前格式 Safe 主密码和会话生命周期

- 终端 `t12p`，写同目录 `report01.md`。唯一可写业务 Git worktree `D:/Document/code/huhu/temp/issue-worktrees/safe-personal`，分支 `impl/huhu-issues-3-10-safe-personal`，父 `64788547141e806f5134fff7290b0d44bfa68b5c`。仅 Windows。本机仅用隔离合成 Vault、主密码及测试桌面配置。四个 worktree 已满，禁止增开。业务原根、集成、其他工作树与远端只读。
- 对照 #9 P1.1、P1.2 前置、spec「个人多账号操作」与 design「Safe 新格式」，核实现有 `plugins/safe` crypto/Safe 生命周期和 `VaultFiles` 原子写。实现必要的版本化主密码/keyring 与空表安全初始化、正确解锁代次与迟到拒绝、冷却、手动/自动/离开/停止失效。优先通过现有主密码入口验证真实效果。保留现有可调用者及旧模块临时依赖直至 P10 切换，禁止迁移或改写真实旧数据。不可把损坏 keyring 或 manifest 当作空库重建。
- 聚焦 P1.1 的独立数据及运行路径，P1.2 的独立多账号内容字段后续接续。可写 `plugins/safe/src/engine`, `plugins/safe/test` 与报告；不可改全局注册、Vault 导出、Engine/Renderer、根锁、外部权限或任何原型。需要跨边界契约时注明所需 shape。
- 先重放真实竞态或故障，优先同一 Safe 多并发初始化、阻塞 scrypt 后锁定/停用、坏文件原字节，以及冷却/自动/离开和重开状态。用现有 Safe 夹具与实际 Engine 入口验证新合成文件，可在受控时间等条件下注入异步。含精确候选、定向测试、TypeScript、lint 与可复查日志。打开过的命令 pane 在完成后关闭。
