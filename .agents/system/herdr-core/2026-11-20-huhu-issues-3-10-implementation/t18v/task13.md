# #7 补齐文件属性与 Shell 目录跟随

共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t18v
task task13.md
report t18v/report13.md

Windows only。在 task-cutover worktree 的 impl/huhu-issues-3-10-ssh-file-follow 开发，基线 cfbce161f19d906ebdb0a6e5368c4e852406e734。已确认全部原型，无需再问。按 #7 source/spec、H6.2 和 H6.4；可写 plugins/ssh、tests/e2e/ssh、tests/e2e/workflows/ssh-workspaces.spec.ts 和 #7 evidence。公共 Engine、Renderer、根锁仍 Lead。复用 Huhu 的文件会话/路径及 ssh2、Motty 成熟实现。先查实际代码已有 rename/delete/mkdir/权限/修改时刻和属主，实施规格要求的缺项，不改不相关交互。H6.4 必须绑定原连接、原分栏和明确的空闲 Shell，避免把未可信的输出或文件名当终端命令、打断前台命令或错误同步到另一分栏。只在实际隔离回环服务器运行 fixture，验证竞态、权限拒绝、错误状态、窗格切换/关闭、源真实数据及无副作用。HTML/CSS/客户端 TS 先完成 MWG search/retrieve。分步提交，完成高价值路径先报告。H6 后梳理 G5c.1 的 SSH 外部资源和信任 H11 以便下轮派发，不要在本任务擅自开放主机执行权限。
