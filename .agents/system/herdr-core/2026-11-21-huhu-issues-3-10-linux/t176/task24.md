# task24 Graph 通知两项独审返工
Lead t3p，worker t176；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
上项 task23 的12文件继续冻结，Lead t1bs真实Core单文件6/6通过。暂不再动Agent/包/前端。
本任务独占：plugins/mail/src/engine/graph-mail.ts、plugins/mail/src/engine/message-cache.ts、plugins/mail/test/oauth-engine.test.ts。t197旧Graph实现已交回。只补 temp/final-audit/t194-task09-final.md 两项真实缺陷，先阅读原任务t197-task04-final.md、独审、现有graph代码及测试。用户规则：旧信移回不再通知，只更新Inbox；真正新信不能按接收时间错过。
1. 已观察移出ID在分页压缩前保留，跨检查点/完成游标持久提交；包括200窗口之外的确切已收ID。2. 较早真新信列表先出现不得提前当作delta已确认，正文窗口退出后仍有真实到达通知资格。沿现有checkpoint及缓存职责最小实现，不另造通用基础设施、不更改账号权限边界。
先增加能复现两项的真实Engine回归（原oauth-engine单文件），跑红再修复。若回环EPERM不要提权，将命令交Lead；只运行单文件vitest及定向静态；不跑E2E/build/package/全仓、不启动agent、不git。审查者正在保存 temp/final-audit/t194-task09-repro.mjs，文件出现后可复用反例输入，但不能只复制通知表达式当验收。
报告 temp/final-audit/t176-task24-final.md，列冻结blob、红绿、未运行的验证。共享协调目录只读，Lead主动收取。
