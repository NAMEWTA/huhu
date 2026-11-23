# Mail 独审三项修复
身份 t1dv/task01.md，Lead t3p，共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release，工作根 /home/wta/projects/huhu main。读取 topic/manifest、AGENTS，按 dev-debug/dev-build。不得派子代理。
读 t1dm/report01.md 三项已定位缺陷及 t1d5/report02.md 当前实现；修复：
1. 账号未读投影与 conversations 的同一消息身份、胜出副本选择统一，保持轻量缓存，不新造平行规则；同账号两个普通目录的相反已读状态与顺序覆盖。
2. 可重建缓存异常不能使账号定义与认证/管理入口消失。保留 Vault 路径守卫，坏摘要未知/错误，健康账号继续可用。两个账号一坏缓存回归（含真实 PATH_OUTSIDE_VAULT，不绕过守卫）。
3. 两处分栏宽度按 Vault/插件偏好持久化，沿用现有 settings/preferences。重开同 Vault 恢复，其他 Vault 独立，窄屏只 clamp 显示不改保存值。以原 source.md §5.4 为准。前端读已确认原型与 guidance。
可写 plugins/mail 相关代码/测试、tests/e2e/workflows/mail.spec.ts，若必须共享偏好 schema 可最小修改并告知Lead。禁止 Agent/Tasks/Dashboard/Web入口/锁文件/版本/SSH。共享树已有 t1d5改动，保留不重置。不 commit/push。
只跑涉及的单个 Vitest 文件；E2E只写不跑，build/typecheck重型由Lead串行。先复现真实问题再修复。报告列具体结果及未运行验证，精准给Lead命令。不要修改启动权限或确认权限提示；如网络/报告 .agents 写入阻塞，交命令给Lead，报告可完整写 temp/closeout-release/t1dv-report01.md 由Lead收取。
Modern guidance 已有：/tmp/mwg-guide-2662753-1795407998277.md（drag/css-layout/accessibility），temp/closeout-release/select-guidance-retrieve.txt（forms/select-menu-interaction）；需要新search/retrieve可把命令交Lead。完成报告按同目录临时原子发布，不能写则用上述temp路径并 hc send t3p。
