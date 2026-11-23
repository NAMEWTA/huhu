# Mail 当前恢复批次与原参数续跑修复
身份t86，Lead t3p。integration基线5c7385b1。task03已收取，t96类型通过，t97真实sessions41/41及CLI/MCP2/2通过；原生文件全冻结给独审与t8k。新任务仅plugins/mail/src/engine/subset-data.ts及plugins/mail/test/outbox-engine.test.ts，必要直接Mail依赖先报告。禁止改Agent/Automations/native/UI/根契约，不提交、不子代理、不重型验证。
读t93/report01.md第1/3项并先用单文件回归复现：1)先仅恢复A，后另份含A+B的包只选B，或同包第一次只选A后来只选B，不能误把既有A当作此次部分成功的批内账号而自动省略冲突确认；2)已有同地址E、显式keepSeparate A+B，第二项失败后重开用新previewId及原accountIds/keepSeparateAccountIds可幂等续跑，不重复A、不覆盖E或恢复后的A认证。
在现有操作日志/确认记录上补持久的同一备份与原选择依据，避免新建平行恢复基础设施。原空库A+B部分失败可用原选择续跑；不同选择必须显式冲突，已经恢复项可返回幂等结果。保留主体绑定、授权、地址锁、事务/投递/附件回滚。限制豁免不要改变数据指纹稳定性。
第2项审查针对未发布旧候选36891d5f写出的日志，目前不做旧开发候选迁移，保持本版v1/v2内容双向身份测试，不额外扩迁移范围；若发现是当前版本触发则报告证据。
Worker只跑outbox-engine该单文件相关过滤，E2E/类型/构建留Lead。写report04，列红绿证据、未运行；冻结后交Lead。
