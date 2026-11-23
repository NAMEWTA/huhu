# 网格夹具挂载生命周期修复
身份 t1d8/task04.md；Lead t3p；共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release；工作目录 /home/wta/projects/huhu。沿用 task02/03 写入边界，不改生产代码、不减断言，不跑浏览器。
修复后第二轮 t1f0 已由 Lead 停止，日志 temp/closeout-release/grid-runtime-fixed.log，trace 在 temp/closeout-release/grid-comparison-results/artifacts-fixed。Vite入口错误已消除，但 main.tsx useLayoutEffect 的 target.clientWidth 读 null，导致 .fixture-stage 缺失。请检查 Huhu 分支与其他候选的 stage ref 生命周期，包括卸载重挂和 ResizeObserver 清理，修复真实夹具缺陷。保留现有测试与失败产物。完成写同目录 report04.md，说明原因、修改和未运行验证，由 Lead 重跑。
