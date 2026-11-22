# 独立审查 d036effb 的 SSH 导入与 4f5cb1c8 的桌面回归

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t17b`
- 工作目录 — `D:/Document/code/huhu/temp/issue-worktrees/integration`
- 分支 — `impl/huhu-issues-3-10-integration`
- 基线 — `d036effb`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17b/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17b/report01.md`

业务文件只读，审查固定提交 d036effb 和 4f5cb1c8。验证导入文件绑定、冲突复审、被并发编辑或中断后的主机/分组去重、持久记录和凭据暴露边界。审查 did-fail-load 的真实失败、取消及信任源行为；只报告可复查缺陷和未测风险。读取 D:/Document/code/huhu/temp/issue-baseline/ssh-import-confirm.log 和 windows-desktop-regressions.log，注意当前工作目录有 Lead 正在做的另一个切片，审查以 git show 的固定对象为准。

阅读根 AGENTS.md 和批次 Goal 约束。复用 D:/Document/code/huhu/temp/sources 中的实际源码，引用上游时记录文件、版本、许可证及采用范围。仅用固定 pnpm 12.10.1 在当前 Windows 跑项目自动化，允许隔离测试 Vault、合成输入及回环服务。不操作外部服务、远端分支、其他 worktree 和真实用户资料，不启动额外 agent。不在报告输出测试秘密。先记录实际产物、命令、结果、未测和明确阻塞。将完整报告原子发布到上述位置，外部 Lead 主动收取。
