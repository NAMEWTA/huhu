# #7 H2.4 真实 SSH 导入确认

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t179`
- 工作目录 — `D:/Document/code/huhu/temp/issue-worktrees/safe-personal`
- 分支 — `impl/huhu-issues-3-10-ssh-confirmed-ui`
- 基线 — `d036effb`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/report01.md`

只实施已确认的 SSH 导入 UI。以 H2.4-import-preview.md、spec.md 和完整原型指纹 0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b 为依据。复用现有 @huhu/ui、SshModule、能力类型和 d036effb 的 ssh.hosts.import.preview/confirm。实际选择文件，展示逐行状态与冲突，可跳过、显式更名和取消，核对过期预览、分组待补齐、原身份重试和成功后刷新主机/分组。测试隔离 Vault 和合成导入文件，不连接任何远程机器。可写 plugins/ssh/src/ui、对应 H2.4 技术证据和新的 SSH 定向端到端测试，配置、锁文件、Engine/Renderer 入口和工作树归 Lead。若共享接口确有不足报告给 Lead。涉及前端先执行本库 zh-modern-web-guidance search + retrieve。

阅读根 AGENTS.md 和批次 Goal 约束。复用 D:/Document/code/huhu/temp/sources 中的实际源码，引用上游时记录文件、版本、许可证及采用范围。仅用固定 pnpm 12.10.1 在当前 Windows 跑项目自动化，允许隔离测试 Vault、合成输入及回环服务。不操作外部服务、远端分支、其他 worktree 和真实用户资料，不启动额外 agent。不在报告输出测试秘密。先记录实际产物、命令、结果、未测和明确阻塞。将完整报告原子发布到上述位置，外部 Lead 主动收取。
