<a id="coordinating-global-events-with-temporal"></a>

# 使用 Temporal 协调全球事件

使用旧的 `Date` 对象跨时区安排事件非常困难，尤其在夏令时（DST）切换前后，一些小时可能被跳过或重复。

`Temporal` API 提供 `Temporal.ZonedDateTime`，用于表示特定时区中的日期和时间，并以自动、可预测的方式处理 DST 切换。

<a id="how-to-implement"></a>

## 实现方法

协调全球事件并处理可能的 DST 冲突时：

1. **必须：创建 ZonedDateTime**。使用 `Temporal.ZonedDateTime.from()` 创建带时区的日期时间对象。
2. **必须：处理歧义**。使用 `disambiguation` 选项控制时间存在歧义或不存在时的行为（例如调钟期间）。
3. **必须：转换时区**。使用 `.withTimeZone()` 查看另一地点的等效时间。

<a id="example-scheduling-and-conflict-detection"></a>

### 示例：排期与冲突检测

```javascript
// 1. Define the event time and target time zone
const date = "2025-03-09";
const time = "02:30"; // This time is skipped in New York during Spring Forward
const timeZone = "America/New_York";
const inputStr = `${date}T${time}[${timeZone}]`;

// 2. Detect conflicts using 'reject'
let hasConflict = false;
try {
  // 'reject' throws RangeError if the time is ambiguous or does not exist
  Temporal.ZonedDateTime.from(inputStr, { disambiguation: 'reject' });
} catch (e) {
  if (e instanceof RangeError) {
    hasConflict = true;
    console.log("This time falls in a DST transition gap or overlap.");
  }
}

// 3. Resolve the time safely using 'compatible' (default)
// 'compatible' will resolve to a valid time even if skipped or repeated
const hostTime = Temporal.ZonedDateTime.from(inputStr, { disambiguation: 'compatible' });
console.log(`Resolved time: ${hostTime.toString()}`);

// 4. Convert to another time zone (e.g., Tokyo)
const tokyoTime = hostTime.withTimeZone("Asia/Tokyo");
// Use toLocaleString() for user-facing display instead of manual hour/minute padding
console.log(`Tokyo time: ${tokyoTime.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
```


<a id="strategic-implementation--best-practices"></a>

## 实施策略与最佳实践

- **应当**对绑定到具体地理位置的事件（例如在特定城市举行的会议）使用 `Temporal.ZonedDateTime`。
- **应当**在需要检测 DST 切换期间的排期冲突并提醒用户时，使用 `disambiguation: 'reject'`。
- **应当**在希望系统于冲突发生时自动选择合理时间的情况下，使用 `disambiguation: 'compatible'`（默认值）。
- **不要**用 `Temporal.PlainDateTime` 表示全球事件，因为它不携带时区信息，也无法考虑 DST 变化。
- **应当**通过 `.withTimeZone()` 计算其他地点的等效时间，且不改变原对象（Temporal 对象不可变）。
- **应当**用原生 `.toLocaleString()` 格式化（例如 `{ hour: 'numeric', minute: '2-digit' }`）显示面向用户的时间，而不是手动计算时间并补零。

<a id="fallback-strategy"></a>

## 回退策略

<a id="fallbacks--browser-support-for-temporal"></a>

### Temporal 的回退与浏览器支持

Temporal 的浏览器支持状态：有限可用。
支持的浏览器：Chrome 144（2026 年 1 月）、Edge 144（2026 年 1 月）和 Firefox 139（2025 年 5 月）。
不支持：Safari。

对于尚不支持原生 `Temporal` API 的浏览器，进行特性检测，并动态加载 `temporal-polyfill`（压缩并 gzip 后约 15 KB）。

注意，导入 `temporal-polyfill` 不会自动将 `Temporal` 对象赋给全局作用域。如果代码依赖 `globalThis.Temporal`，需要显式赋值。

```javascript
// Check if Temporal is supported natively
(async () => {
  if (typeof Temporal === 'undefined') {
    // Load the polyfill conditionally
    const module = await import('https://esm.sh/temporal-polyfill');
    globalThis.Temporal = module.Temporal;
    // Extend Date.prototype if needed
    Date.prototype.toTemporalInstant = module.toTemporalInstant;
  }
  initializeApp();
})();
```