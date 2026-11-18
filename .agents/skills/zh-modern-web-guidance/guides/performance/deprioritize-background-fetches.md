<a id="deprioritize-background-fetches"></a>

# 降低后台请求的优先级

页面同时发出多个网络请求时，它们往往会争用同一份带宽。应降低分析、日志或后台同步等非关键数据请求的优先级，让用户发起的请求或关键数据请求更快完成。

<a id="how-to-implement"></a>

## 如何实现

1. **识别后台请求**：确定哪些 `fetch()` 调用获取的是非必要数据，不会影响用户当前的体验。
2. **设置请求优先级**：在 `fetch()` 的初始化对象中添加 `priority: 'low'` 选项。

<a id="example-code"></a>

## 示例代码

```javascript
// Use high priority (default) for critical UI updates
const criticalData = await fetch('/api/data');

// Explicitly deprioritize background analytics
fetch('/api/analytics', {
  method: 'POST',
  body: JSON.stringify(eventData),
  // Lower the priority to prevent network contention
  priority: 'low'
});
```

<a id="best-practices"></a>

## 最佳实践

- **应当**为当前视图不需要的分析、信标或遥测数据使用 `priority: 'low'`。
- **应当**为用户之后*可能*需要的数据“预取”使用 `priority: 'low'`，避免拖慢*当前*需要的数据。
- **不要**为对用户体验至关重要的请求使用 `priority: 'low'`。
- **不要**在 fetch 选项对象中使用已弃用的 `importance` 键。正确的键是 `priority`。

<a id="fallback-strategy"></a>

## 回退策略

Fetch priority 的 Baseline 状态：Newly available。自 2024-10-29 起纳入 Baseline。
支持的浏览器：Chrome 103（2022 年 6 月）、Edge 103（2022 年 6 月）、Firefox 132（2024 年 10 月）和 Safari 17.2（2023 年 12 月）。

Fetch API 的 `priority` 选项是一种渐进增强。不支持它的浏览器会忽略该选项，以默认优先级处理请求。基本用法无需显式的特性检测或回退逻辑。
