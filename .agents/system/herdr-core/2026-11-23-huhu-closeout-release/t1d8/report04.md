# Dashboard 网格夹具挂载生命周期

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead — `t3p`
- terminal_address — `t1d8`
- task — `task04.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/task04.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/report04.md`
- 执行结果 — `done`，夹具修复和静态核对已完成，待 Lead 重跑。

## 根因与修复

工作目录为 `/home/wta/projects/huhu`，基线 `cc551778`。Lead 停止了第二轮。已读的 8 份 Huhu trace 均记录了 `Cannot read properties of null (reading 'clientWidth')`，调用栈落在 App 初次 layout effect 的 `measure`。该 effect 读取了 `stage.current`，原 JSX 漏掉了 `ref={stage}`。四个候选都经过这段挂载流程。 [第二轮日志](../../../../../temp/closeout-release/grid-runtime-fixed.log) · [原始 trace](../../../../../temp/closeout-release/grid-comparison-results/artifacts-fixed/)

只修改夹具 `main.tsx`。将 ref 绑定到四个候选共用的外层容器。测宽 effect 在容器挂载后取一次初始宽度，再由 ResizeObserver 跟踪变化。由工具栏卸载或重挂画布只替换容器内的候选，外层测宽继续工作。外层卸载时标记回调失效并断开观察器。诊断入口在容器尚未挂载或宽度为零时返回零宽和有限的步距数值，仍可保留该阶段的诊断。 [测宽与清理](../../../../../temp/closeout-release/grid-comparison/main.tsx#L77) · [共用容器](../../../../../temp/closeout-release/grid-comparison/main.tsx#L184)

## 验证

- 通过 TSX 语法解析，核对唯一的 `.fixture-stage` 绑定了 ref，画布挂载条件位于其内部，测宽前检查节点且清理路径调用 `disconnect()`。通过 `git diff --check`。
- 第二轮日志散列复核一致，8 份 trace 继续保留。32 项 Playwright 行为断言沿用上一轮。
- Worker 未启动浏览器、Playwright 或构建。真实挂载、宽窄切换与反复卸载重挂由 Lead 使用原命令和新的输出目录复验。

### Modern Web Guidance

- **`responsive-design`** 我把测宽绑定在候选共用的容器，宽窄选择读取容器可用宽度（“adapt to their parent container's size”）。

## Lead 验收

Lead 验证 t1f2 已进入实际交互，多项 Huhu/RGL 行为通过，挂载异常消除。接受本任务夹具修复，32项对照仍在运行，不代表完整选型验收。
