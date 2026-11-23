# t178 / task08 插件启停网络诊断

新增独立的 [plugin-perf-diagnostics.ts](../../tests/e2e/helpers/plugin-perf-diagnostics.ts)。它用 Playwright 的 request、response、requestfinished 和 requestfailed 事件观察现有请求。

- 白名单包括 `plugins.setEnabled`、`plugins.list`、`capabilities.discovered` 对应的 GET、`home.summary`、`home.notes.recent` 和 `health.run`。
- POST 只提取请求信封顶层的能力名和格式已校验的 requestId。GET 能力发现没有 requestId。附件只包含方法、观察到请求／响应头／结束的时间、状态、Playwright 网络 timing 和响应大小。请求入参、鉴权头、响应正文和完整 URL 均不会写入附件。
- 响应大小在正式计时结束后从 Playwright 网络元数据获取，最多等待 1 秒。大小未取得时保留 `null`，停止观察时尚未结束的请求显示 `pending`。驱动时间标记和事件到达时间使用 epoch 毫秒，Chromium timing 的各阶段以其 `startTime` 为基准。事件到达时间不能单独证明 Engine 入站或内部耗时。

## Lead 接入位置与 API

在 [冷启动与插件启停用例](../../tests/e2e/perf.spec.ts#L37) 的 `app.firstWindow()` 后，诊断开关开启时调用 `observePluginPerformance(page, test.info())`。用 `mark(name, at?)` 记索引就绪和停用／启用的起止。可把已有的 `t1`、`t1 + off`、`t2`、`t2 + on` 传入，沿用原切换请求和时钟。测量完成或断言失败后，在 `app.close()` 前调用 `await diagnostics?.attach()`，生成 `plugin-perf-network.json`。它会调用幂等的 `stop()` detach 监听，也可单独调用 `stop()`。

## 验证

新增文件的定向 TypeScript 检查零诊断，oxlint、oxfmt 和 Node 语法检查均通过。未运行 Electron／Playwright E2E、Vitest、构建或全仓检查。现有 perf 文件由其他 worker 接入，本轮仅编写 helper 和本报告。
