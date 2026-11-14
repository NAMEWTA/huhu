# Electron e2e 与 UI 联动的重复陷阱

核对：2026-11-13，`tests/e2e/**`、`packages/workbench/src`，来源为 0.0.1 实施期间实际踩过的失败。

| 现象 | 原因 | 做法 |
| --- | --- | --- |
| 点 `main` 左上角点到了标签条 | 内容区顶部是标签栏 | 点内容区内的具体元素（如某个 tab），不要用坐标 |
| `expect.poll` 回调里抛错直接中止 | poll 不重试抛出的异常 | 回调内部吞掉错误返回 `undefined`，或用 `toPass` |
| 复选框/开关断言偶发失败 | 状态异步更新，`uncheck()` 会立刻校验 | 用 `click` 后再用 poll 断言 |
| `getByRole("option")` 命中 `<select>` 的 option | 原生 select 也暴露 option 角色 | 先限定到 `listbox` 再取选项 |
| 新增一类实体后列表仍是旧数据 | `entity.changed` 没发或 `ENTITY_CAPS` 未登记（staleTime 5 s） | 引擎发事件 + 在 `query.ts` 登记前缀 |
| AppShell 在没有 `EngineProvider` 时崩溃 | 启动页阶段外壳在 Provider 外渲染 | 用 `useOptionalEngine`，把需要引擎的逻辑放进只在 Provider 内渲染的子组件 |
| Windows CI 偶发：读 `gateways.json` 取 `.mcp.enabled` 抛错；监听器重命名用例超时 | 文件尚无 `mcp` 键；Windows 监听更慢 | 读取用 `?.`；Windows 放宽等待（10 s `until` + 30 s 用例超时） |
| “只读 Vault”用例全量运行时偶发超时 | 负载下首屏慢 | `toPass` 重试，单独跑通过才算非回归 |
| 脚本批量改 JSX 后文件语法坏了 | 用子串（如 `) : null}`）切片会命中更深缩进的同样文本 | 改完必须读回/类型检查；重要尾部手工重写 |
| 性能用例 p95 在满载机器上超标 | 指标对负载敏感，CI 上已放宽 | 只在空闲机器上做正式测量并记录负载 |
