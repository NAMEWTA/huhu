# Windows 全量 Vitest onTaskUpdate 超时根因

共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t1bq
task task02.md
report t1bq/report02.md

只读分析 Windows 实际日志 temp/issue-baseline/7ff591a0-window-candidate.log，全部 1291 assertions 通过、25 skip，runner worker 遇到一次 onTaskUpdate IPC timeout 后整体失败；更早 0c96c27b 同样发生。核对仓内 vitest workspace、实际安装的 3.2.7 RPC transport、定向测试表现、资源竞争和可控复跑入口。优先给客观可执行最快的区分试验，区分生产回归、测试超时与进程 IPC 报告超时。不要禁止错误处理、不要编辑仓库或 node_modules、不要启动第二个同时抢集成构建的全量 suite。仅 Windows。围绕是否 --maxWorkers 1、不同 pool/按项目 grouping、控制 report 输出，以及是否存在准确限速/可配置字段。独立证据和适用边界放报告。
