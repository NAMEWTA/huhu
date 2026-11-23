# 独审 Linux Agent 原生启动候选
身份 wta-ubuntu/t8y，Lead t3p，工作目录 integration。dev-review，模型sol/xhigh，只读业务，只写 report01.md，不子代理。
固定范围 d0f50bbb^..d0f50bbb，含27新增/修改文件。按 #4 Agent CLI spec/design、原确认原型与 AGENTS 核对普通配置（无保护服务也可运行）及 Linux 原生受保护环境（真实PTY、argv/cwd、输入/resize、退出/重挂、脱敏与生命周期）。来源/许可由 Lead 72aea473 已登记。读取 t86/report01.md 与本change evidence/W7.3-linux-environment.md；Lead Linux build/PT Y三组/sessions31/types/lint 通过，Windows交叉编译通过但未运行，不误报成最终包验收。
当前 t86/task02 正修改丢Core回包后的恢复机制，独立分析 t8t/report01 已确认此缺口。不要重复它作为新发现，不读动态改动作固定候选结论；本次聚焦 Go实现及Agent原生环境的其他真实行为问题、与直接调用方兼容和协议/资源清理，特别正常provider启动和普通路径不退化。最终task02仍须复核，报告明确本次不覆盖新接续。
复用源码与固定提交 git show，不创建新worktree。可用只读小探针或单Vitest，不Go编译/E2E/全仓/typecheck/构建/打包，不碰真实旧库或用户进程。不要把平台未实测或泛化的假想风险列成确定缺陷，实际发现需触发条件、行号与证据；规格/规范两轴和未验证项分开。SSH暂停不在范围。
完成报告，回告t3p；HC权限锁不可用则共享报告即可。
