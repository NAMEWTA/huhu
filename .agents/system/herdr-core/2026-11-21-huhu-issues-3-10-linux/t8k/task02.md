# 核对同地址双账号包的中断重试
身份 wta-ubuntu/t8k，Lead t3p；继续 agent-linux，基线 cda0aa30（Lead已提交并合入集成 c1b5cd39）。task01已收取，勿再写 Automations；那些文件已交 t86。仅写 plugins/mail/** 与同文件回归测试，禁止其他路径/子代理/重型验证/提交。
Lead 读 diff 发现待证风险：subset-data.restore 的 restoredInBatch 从空 Set 开始，state=restored 行直接 continue；若同地址双账号包第一次只完成第一账号，第二个因故障失败，重试时 first=restored、second=same-email 且原 keepSeparate 列表为空，可能无法按原选择继续第二个。请用现有 OperationLog/凭据故障注入、同地址不同ID包构造中断后同参数重试，先验证该风险是否真实。不把既有目标账号误作本批账号，不需要另造协议。
若复现，最小修复允许已证明来自同一包/持久内容的先前恢复账号纳入批内身份集合，保留普通同地址目标显式选择和真实冲突拒绝。覆盖第二账号失败后重开，再以原同参数恢复，最终两条唯一账号与数据，无重复发送/认证覆盖。若不能复现写清代码证据，不强造红灯。
仅运行 outbox-engine.test.ts 相关单文件/过滤，遇socket EPERM不重复尝试。完成 report02.md，区分实际结果和未验证；使用原有当前文件，不回滚task01修复。
