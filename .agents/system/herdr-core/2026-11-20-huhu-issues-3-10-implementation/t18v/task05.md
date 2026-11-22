# SSH 工作区模板与可重开的局部启动

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t18v`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`，继续同分支，基线 `3f479b899d67000d26ba95f0f069a39aa86569df`。
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report05.md`

按 #7 已确认原型、H4.1-workspace-template.md 和 H4.2-workspace-launch.md，先交付可由实际 Workbench 保存、重开、重命名、删除的有序工作区模板。复用真实 SSH 目录、原 SshManager 生命周期和有证据的 Motty spec.go 源；先实现 1–12 主机及预设，补自定义树结构、布局预览与约束，再将每个 Pane 接到真实连接结果与尚待信任反馈。模板应当没有认证材料、输出或活连接；旧目标被删除、身份已变或认证拒绝时明确归属，不把它当作任一另一主机。可独立提交模板及启动两个小切片，优先给模板实际 Windows E2E。按 Issue 与现有 Host 删除依赖合约处理引用，记录必须进一步核对的范围。

可写 plugins/ssh、#7 证据和专属 SSH 测试。公共 Vault、注册装配、工作台全局样式与根锁归 Lead。客户端改动先运行 Modern Web Guidance search/retrieve。测试 SSH 只用 Windows 临时 Vault 和本机回环夹具，不用真实主机或账号、不新建 worktree、不写远端。按文件协议报告，已完成且不复用的子测试 pane 关闭。
