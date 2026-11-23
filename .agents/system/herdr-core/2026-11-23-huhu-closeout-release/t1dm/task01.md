# Web 与 Mail 独立审查
身份 t1dm/task01.md，report01.md，Lead t3p，共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release，工作根 /home/wta/projects/huhu main。按 dev-review 只读业务；不得派子代理、提交或跑重型验证。当前 worktree 包含其他并发 Agent/Tasks resume，不属于本审查。

读 t1d8/report01.md 和 t1d5/report02.md 与原 #6/#8 specs/确认原型。独审当前未提交改动：独立 Web 入口/共享工作台/Engine asset path/构建配置/空 MCP 删除/release Linux Go；外部已授权 Agent 普通评论；Mail M01 未读状态/独立刷新/上下文管理/可调分栏。代码与规格、项目规范两轴。关注不同账号操作身份、切换取消、投影一致性、Web 与 Electron 入口独立可用、菜单焦点、窄屏，不把纯推测列为已证实缺陷。引用文件行与最小复现。

Lead 已运行 desktop 定向 tsc t1dj 通过；build:web t1dk 通过（temp/closeout-release/web-build.log）。worker 单文件 Vitest 通过见报告。E2E/打包未完成，不能从静态认定通过。前端相关请按指导 search/retrieve；若网络命令权限提示，取消后把所需命令交 Lead，不修改启动权限、不接受提示。已有 drag/css-layout/accessibility 指南 /tmp/mwg-guide-2662753-1795407998277.md 可读；forms/select-menu-interaction 在 temp/closeout-release/select-guidance-retrieve.txt。必要只读检查可运行。输出清晰缺陷、验证缺口和可关闭条件，原子发布报告，hc send t3p 回告。
