# Mail 恢复修复独立复核
身份wta-ubuntu/t93，Lead t3p。只读业务代码，不启动代理，不运行重型验证。仅可写本目录report01.md。
用dev-review。固定集成c1b5cd39与0f24ba18中的Mail文件，不审查工作树正在变化的Agent/Automations。读t8g/report01.md Mail第1-3项、t8k/report01.md/report02.md以及Issue8相关子集恢复合同。核对修复：空库同地址双账号各自恢复；已读定位立即再导出保留；v1/v2可选messageLocations不改变恢复身份；第二账号WRITE_PARTIAL后重开同原选择续跑且不覆盖既有目标认证/重复投递。
Lead实测0f24ba18 outbox-engine17/17和Mail定向tsc通过，日志temp/issue-evidence/huhu-2026-11-22/mail-partial-recheck.log；四文件lint通过mail-revoke-diff.log。不能以绿灯替代调用方审查。重点看inspect的confirmed/fingerprint/restoredInBatch、外部授权/锁/事务回滚保持、原有同地址目标仍需显式选择。必要时只运行对应单个Vitest过滤；socket EPERM不重试，不全套/类型/E2E/打包。不泛化不相关模块审计，不SSH。
输出具体有证据缺陷或确认各原发现已修；区分未实际UI/包验收。不修改实现，不扩大范围。
