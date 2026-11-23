# Mail 分栏保存生命周期修复
身份 t1f9/task01.md；Lead t3p；共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release；工作目录 /home/wta/projects/huhu。sol/high，仅本任务代码与对应单测/E2E，禁启动其他agent，禁跑浏览器/build/全仓检查。先读项目 AGENTS 和相关技能。
按 t1f3/report01.md 三项确证修复 Mail 分栏持久化：Vault切换/关闭与模块卸载前排空，权限尚未知不得静默丢写，明确失败能重试同值且离场不假成功，迟到 settings.get 不覆盖成功写后的宽度。复用既有离场guard/query取消/保存队列，不自造通用基础设施。只写 plugins/mail、必要mail spec；若要共享模块修改先告知Lead，其他worker拥有Tasks/Web/Dashboard。
Lead已验证正常桌面路径3/3，messages-engine5/5，desktop+指定UI types与build通过；不要回退两个已修引擎问题。请补低成本红绿测试（单文件）和真实UI延迟/失败回归用例，E2E只写不跑。完整报告同目录 report01.md，只读则temp/closeout-release/t1f9-report01.md，不请求绕过发送权限；Lead主动收取。
