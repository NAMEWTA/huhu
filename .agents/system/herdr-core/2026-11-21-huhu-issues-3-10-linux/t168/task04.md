# t168/task04 轮询大小写路径返工复核
Lead t3p，integration，只读业务。Lead在你task03基础上修复 watcher.ts：poll把已有next快照传给flush，轮询不再用旧拼写重新stat；原生仍实时infoOf。vault-index.test的两个真实rename模拟用例延伸为真实VaultWatcher轮询、改写、后续多轮poll，旧名和标签重复红灯2失败19通过 ->修复两文件绿灯。日志 temp/final-audit/index-polling-case-{red,check}.log。复核该限定diff及原生pending/heldCreated交叉逻辑，不新增相邻需求。可跑受影响单文件，禁重型。报告 temp/final-audit/t168-report04.md。
