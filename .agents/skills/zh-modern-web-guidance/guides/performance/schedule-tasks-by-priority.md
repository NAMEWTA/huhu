<a id="schedule-tasks-by-priority"></a>

# 按优先级调度任务

构建复杂 Web 应用时，不同任务有不同紧急程度。完成当前视图的任务比发送分析数据或预取资源更重要。优先级任务调度 API，即 `scheduler.postTask()` 和 `TaskController`，可以按优先级安排工作、调整优先级和取消任务，让主线程保持对用户输入的响应。

`scheduler.postTask()` 控制任务彼此之间的*开始*顺序，但单个回调一旦开始，如果运行超过 50ms，仍会阻塞主线程。要在保留任务优先级和 `TaskSignal` 的同时拆分长时间运行的工作，应在回调内定期调用 `await scheduler.yield()`，参见 `break-up-long-tasks`（通过 `npx -y modern-web-guidance@latest retrieve "break-up-long-tasks"` 获取）。

<a id="scheduling-tasks-by-priority"></a>

### 按优先级安排任务

使用 `scheduler.postTask()` 将任务安排为以下三种优先级之一：

- `user-blocking`：阻碍用户交互的任务，例如输入处理、关键渲染。
- `user-visible`：用户可见但不阻塞交互的任务，默认值。
- `background`：对时效要求不高的任务，例如分析、后台索引、预取。

```javascript
// Schedule a high-priority task that blocks user interaction
scheduler.postTask(() => {
  // DO: Handle critical updates that impact user interaction
  handleCriticalUpdate();
}, { priority: 'user-blocking' });

// Schedule a default priority task
scheduler.postTask(() => {
  // DO: Render non-critical content that is visible to the user
  renderSecondaryContent();
}); // Defaults to 'user-visible'

// Schedule a low-priority background task
scheduler.postTask(() => {
  // DO: Perform heavy background work that is not time-critical
  sendAnalytics();
}, { priority: 'background' });
```

<a id="aborting-or-reprioritizing-tasks-with-taskcontroller"></a>

### 使用 `TaskController` 取消任务或调整优先级

可选：如果排队工作可能过时，或紧急程度可能变化，例如导航时取消后台索引，或打开预取视图时提升其优先级，创建 `TaskController`，并将 `controller.signal` 传给 `scheduler.postTask()`：

```javascript
const controller = new TaskController({ priority: 'background' });

// Omit `priority` here—passing an explicit `priority` alongside `signal`
// overrides `controller.signal` and ignores `controller.setPriority()`.
const taskPromise = scheduler.postTask(async () => {
  await buildSearchIndex();
}, { signal: controller.signal });

// Promote if the user interacts immediately, or call controller.abort() to cancel
controller.setPriority('user-blocking');
```

<a id="fallback-strategies"></a>

### 回退策略

Scheduler API 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 129（2024 年 9 月）、Edge 129（2024 年 9 月）和 Firefox 142（2025 年 8 月）。
不支持的浏览器：Safari。

如果 Baseline 目标不支持优先级任务调度 API，而应用依赖多级优先级顺序（`user-blocking`、`user-visible`、`background`）或 `TaskController.setPriority()`，应通过动态 `import()` 按条件加载 `scheduler-polyfill`，让已经支持的浏览器不承担额外包体成本：

```javascript
// MANDATORY: Feature-detect scheduler.postTask and load the polyfill only when missing
if (!('scheduler' in window && 'postTask' in window.scheduler)) {
  await import('scheduler-polyfill');
}

// Safe to use scheduler.postTask and TaskController in all browsers
scheduler.postTask(() => {
  sendAnalytics();
}, { priority: 'background' });
```

如果只用 `scheduler.postTask()` 把非紧急后台工作移到当前轮次之后，并不需要跨任务优先级重排或动态 `setPriority()`，可以不引入外部依赖。在 `scheduler.postTask` 不可用时，优雅降级到 `setTimeout(callback, 0)`；如果传入了 `AbortSignal`，执行前检查 `signal?.aborted`。
