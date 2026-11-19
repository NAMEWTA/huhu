# task09 · A07 修复连带的单测失败

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-session`，分支 `closeout/issue2-session`（当前 4f5d524）。

pB 在 ca28e78 上发现：`plugins/notes/test/service.test.ts:279`「单个文件移动不会改写指向其所在文件夹的 [[目录/]]」现在失败（`目标文件夹不存在：归档`），因为该用例依赖了旧 `move` 隐式创建目标目录。task08 只跑了三个测试文件，漏掉了它。

Lead 决定：保留 4f5d524 的严格行为（`notes.move` 目标目录必须已存在；外部调用方需先 `folders.create`），修测试夹具——在 setup 中加入目标目录（例如加一个 `归档/` 下的占位或先 `svc.createFolder`/现有同文件里其他用例的建目录方式），断言保持不变。

要求：
1. 只改 `plugins/notes/test/service.test.ts`。
2. 运行完整 `pnpm test`（不是筛选），记录总数和结果；另跑 `pnpm typecheck`、`pnpm lint`。检查整个仓库是否还有其他测试依赖 move 隐式建目录（`grep` `move(` 的测试调用并核对目标目录是否存在），一并列入报告。
3. 不跑 e2e。
回报 `report09.md`（提交 SHA、命令与结果），manifest 中 w4:pC 改为 done。
