# 补齐统一工具与独立Web构建
身份t1d8/task01.md，Lead t3p。阅读t1d3/report01.md #6缺口并核对源代码。负责范围：外部已授权tasks.comments.add给Agent任务添加普通讨论评论（不变成执行输入，不伪造回执）；独立Web构建入口复用BrowserRoot宿主，桌面包正确提供独立Web制品给Engine；删除无职责plugins/mcp空workspace包并修正引用。保留所有授权/默认关闭和既有浏览器行为。可写plugins/tasks/src/engine/index.ts及对应测试，apps/desktop构建/renderer入口/engine-supervisor有关文件，独立Web新入口，plugins/mcp，必要依赖配置与锁文件（先告知Lead）、相关脚本测试。不改AgentCli/TaskEditor/dispatch，不改Mail，不改版本号。写E2E覆盖独立web产物及外部Agent普通评论，Lead统一跑。另补release.yml Linux同Windows安装固定Go1.26.7及go mod download（Linux beforePack调用原生helper、GOTOOLCHAIN=local，当前仅Windows setup-go）；不减现有门禁。使用dev-build。

工作目录 /home/wta/projects/huhu，共享主工作树，无新增worktree。读topic/manifest核对身份。不要 git commit/push、不要关闭Issue、不要移动change。复用优先；前端必须先执行zh-modern-web-guidance搜索并retrieve完整指南。只跑涉及的单个vitest文件；E2E只写不跑，禁止build/打包/全仓检查。报告列未运行验证。必要的定向tsc由Lead执行。报告临时稿原子发布，hc send t3p 回告路径。
报告绝对路径：/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/report01.md
