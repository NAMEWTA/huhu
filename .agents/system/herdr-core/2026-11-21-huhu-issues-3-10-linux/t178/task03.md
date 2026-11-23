# t178 task03 事件洪流导致查询风暴
Lead t3p；cwd integration。当前固定4a真实滚动诊断 temp/final-audit/task-scroll-diagnostic-4a54f0a9.log 显示1000文件通知触发约1000 tasks.list 请求，退出 home.focus.get 排在后方；滚动仍133ms。不要打印巨大 pending 数组，Python解析 counts 即可。
修复 packages/workbench/src/engine-client/query.ts/react.tsx 及直接必要同目录文件、packages/workbench/test/engine-client.test.ts。唯一写者是你。不碰 perf 探针、Tasks UI、其余业务。
先检查现有实现/成熟TanStack查询机制并遵循 frontend guidance。目标：保留逐个领域事件交付，不丢最后变更；相同查询刷新在途时合并后继刷新，避免每事件取消并重新请求导致排队；不同Vault/查询隔离，退出和卸载清理；安全锁定的缓存清理立即生效，不延迟权限撤销语义。不要简单 cancelRefetch:false 丢掉在途之后事件，不用无限debounce饿死更新，不硬编码跳过文件通知。优先复用库能力、最小适配。
用真实 QueryClient/QueryObserver 控制请求Promise重现1000事件洪流和在途后新版本，先红后绿；确认最终数据、有限请求、故障/取消/不同Vault。只跑这个Vitest文件，无E2E/构建/全仓检查，无子代理。报告 temp/final-audit/t178-report03.md，列未运行验证。
