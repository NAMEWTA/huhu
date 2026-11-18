<a id="break-up-long-tasks"></a>

# 拆分长任务

繁重计算或长循环可能阻塞主线程，延迟事件处理器执行，导致交互到下一次绘制（INP）的响应表现变差。为避免这种情况，应定期使用 `scheduler.yield()` 将控制权交还浏览器。它会暂停正在运行的任务，让浏览器先处理等待中的用户输入和渲染，再继续任务。

`scheduler.yield()` 只会拆分单个正在运行的任务；它不会为独立工作流安排优先级顺序（`'user-blocking'`、`'user-visible'`、`'background'`），不会在非紧急后台任务开始前推迟它，也不能通过 `TaskController` 取消队列中的任务或调整其优先级。调度不同优先级的工作时，**不要**仅用 `scheduler.yield()` 替代 `scheduler.postTask()` 或 `TaskController`；参见 `schedule-tasks-by-priority`（通过 `npx -y modern-web-guidance@latest retrieve "schedule-tasks-by-priority"` 获取）。如果通过 `scheduler.postTask()` 调度的后台任务本身超过 50ms，应组合使用这两个 API，在 `postTask()` 回调内调用 `await scheduler.yield()`；后续继续执行的部分会自动继承所在任务的优先级和 `TaskSignal`。

<a id="breaking-up-long-tasks"></a>

### 拆分长任务

在异步函数内使用 `scheduler.yield()` 拆分工作。

```javascript
async function processLargeArray(items) {
  // DO: Set a time-based deadline 50 milliseconds into the future. 50
  // milliseconds is the boundary for when a task becomes a long task.
  let deadline = performance.now() + 50; // 50ms budget

  for (const item of items) {
    // Process the item
    processItem(item);
    
    // MANDATORY: Yield to the main thread periodically to keep the UI
    // responsive. This can be done by checking if the deadline set earlier
    // has been exceeded. When it has been, yield, then reset the deadline
    // another 50 milliseconds into the future.
    if (performance.now() >= deadline) {
      await scheduler.yield();
      deadline = performance.now() + 50;
    }
  }
}
```

<a id="fallback-strategies"></a>

### 回退策略

Scheduler API 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 129（2024 年 9 月）、Edge 129（2024 年 9 月）和 Firefox 142（2025 年 8 月）。
不支持的浏览器：Safari。

如果你的 Baseline 目标不支持 Scheduler API，应使用 `setTimeout` 实现回退，让长循环仍能把控制权交还主线程而不抛出异常。（如果将 `scheduler.yield()` 与 `scheduler.postTask()` 组合使用，还要单独检测 `postTask` 是否可用。）

<a id="fallback-for-scheduleryield"></a>

#### `scheduler.yield()` 的回退实现

```javascript
async function processLargeArrayWithFallback(items) {
  // DO: Set a time-based deadline 50 milliseconds into the future.
  let deadline = performance.now() + 50;

  for (const item of items) {
    processItem(item);
    
    // MANDATORY: Yield to the main thread periodically to keep the UI responsive.
    if (performance.now() >= deadline) {
      // DO: Feature detect scheduler.yield
      if ('scheduler' in window && 'yield' in window.scheduler) {
        await scheduler.yield();
      } else {
        // DO: Fallback to setTimeout for older browsers
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      deadline = performance.now() + 50;
    }
  }
}
```
