# 补齐Mail账号行与分栏
身份t1d5/task02.md，Lead t3p。task01已验收。先修notes任务说明中原生历史作为任务目标的措辞：目前dispatch明确unsupported，不能写已支持；后续由其他worker补齐再更新。阅读t1d4/report01.md #8缺口、Mail原型与S1a.3。实现账号行未读数/同步或异常状态、悬停刷新与键盘可达等价入口、账号右键刷新/修复/编辑/删除（复用现有操作，不能误作用当前账号），宽屏账号/联系人/阅读可拖动调整分栏；窄屏保留已有分层。复用项目现有分栏/菜单组件和one-mail成熟实现，先读guidance。仅写plugins/mail UI与必要共享数据合同/单测及tests/e2e/workflows/mail.spec.ts（及专门mail新spec）；不要改Graph通知算法/其他模块。写E2E覆盖两个账号与拖动、键盘/窄屏；只写不跑。给Lead单文件测试与E2E建议。报告report02.md。

工作目录 /home/wta/projects/huhu，共享主工作树，无新增worktree。读topic/manifest核对身份。不要 git commit/push、不要关闭Issue、不要移动change。复用优先；前端必须先执行zh-modern-web-guidance搜索并retrieve完整指南。只跑涉及的单个vitest文件；E2E只写不跑，禁止build/打包/全仓检查。报告列未运行验证。必要的定向tsc由Lead执行。报告临时稿原子发布，hc send t3p 回告路径。
报告绝对路径：/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d5/report02.md
