# #8 Mail 账号、草稿和重试工作区

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t17c`
- 工作目录 — `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 分支 — `impl/huhu-issues-3-10-mail-confirmed-ui`
- 基线 — `d036effb`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report01.md`

完整原型已确认，指纹 9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65。核对实际 Mail capability/schema/spec，优先实现邮箱添加与连接测试、草稿保留、部分接受只重试明确失败收件人、待核实状态。复用现有 Dialog、Field、通知和 UseCapability，从现有 Mail 传输或账号底层走真实本机 loopback 测试；不使用外部邮箱。可写 plugins/mail 和 #8 对应任务证据。共享 Engine/Renderer 装配、插件静态注册、公共契约、根锁文件各归 Lead；在报告给出所需最小接入变更。前端先执行 zh-modern-web-guidance search + retrieve。

阅读根 AGENTS.md 和批次 Goal 约束。复用 D:/Document/code/huhu/temp/sources 中的实际源码，引用上游时记录文件、版本、许可证及采用范围。仅用固定 pnpm 12.10.1 在当前 Windows 跑项目自动化，允许隔离测试 Vault、合成输入及回环服务。不操作外部服务、远端分支、其他 worktree 和真实用户资料，不启动额外 agent。不在报告输出测试秘密。先记录实际产物、命令、结果、未测和明确阻塞。将完整报告原子发布到上述位置，外部 Lead 主动收取。
