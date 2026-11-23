# 定向类型兼容修复
Lead t3p，worker t86，integration基线be992934。按已投递消息，仅修native-recovery-types.log的4处Promise.withResolvers错误（sessions.ts、sessions.test.ts、Automations service.ts）。使用现有ES库可表达的Promise构造，保持原行为；不改根tsconfig/其他模块，不触碰已转交t8k的native文件。交report03后冻结，Lead运行定向tsc与真实Core/CLI。
