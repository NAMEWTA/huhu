<a id="sorting-high-precision-timestamps-with-temporalinstant"></a>

# 使用 Temporal.Instant 对高精度时间戳排序

日志查看器、审计时间线和遥测 UI 经常会接收由服务器、数据库或原生时钟以微秒或纳秒精度记录的 ISO 8601 事件时间戳（例如 `2026-04-01T12:00:00.000123456Z`）。旧的 `Date` 对象只存储毫秒，因此用 `new Date()` 或 `Date.parse()` 解析这些字符串，会静默截断毫秒以下的数字，让同一毫秒内的不同事件发生碰撞，排序顺序也不稳定。

`Temporal.Instant` 以纳秒精度表示 UTC 时间线上的确切时间点，不附带时区。通过 `Temporal.Instant.from()` 解析预先记录的高精度时间戳时，它会保留完整纳秒值，用 `Temporal.Instant.compare()` 确定性地排序，并计算事件之间精确的 `Temporal.Duration` 间隔。注意，为缓解 Spectre 计时攻击，浏览器中的 `Temporal.Now.instant()` 被有意限制在毫秒或微秒分辨率：保留外部时钟产生的纳秒时间戳时，使用 `Temporal.Instant.from()`；在客户端本地测量小于一毫秒的间隔时，使用 `performance.now()`。

<a id="how-to-implement"></a>

## 实现方法

解析、排序高精度时间戳并测量它们之间的间隔时：

1. **将已记录时间戳解析为 `Temporal.Instant`**：对服务器、数据库或日志行提供的时间戳字符串调用 `Temporal.Instant.from(isoString)`。保留来源记录的时间戳，不要在浏览器中用 `Temporal.Now.instant()` 替换。
2. **按时间顺序排序事件**：将 `Temporal.Instant.compare(a, b)` 作为比较器传给 `Array.prototype.sort()` 或 `Array.prototype.toSorted()`。它比较完整纳秒值，因此能保留毫秒以下的先后顺序。
3. **计算间隔**：用 `instant.since(previousInstant)` 得到连续事件之间的 `Temporal.Duration`。用 `a.equals(b)` 检测时间戳完全相同的事件。
4. **通过 `toLocaleString()` 显示间隔**：用 `duration.toLocaleString()` 格式化面向用户的 `Temporal.Duration`，它会委托给 `Intl.DurationFormat`。不要为了显示而把间隔转换为一个纳秒数 `Number`。
5. **序列化以便传输**：使用 `Temporal.Instant.prototype.toString()` 输出标准 ISO 8601 字符串（始终为 UTC，带 `Z` 后缀）。

<a id="example-code-sorting-high-precision-timestamps"></a>

## 代码示例：排序高精度时间戳

```javascript
// Events received with nanosecond-precision ISO 8601 timestamps.
const rawEvents = [
  { nodeId: 'api-2', eventType: 'db.query', ts: '2026-04-01T12:00:00.000123456Z' },
  { nodeId: 'api-1', eventType: 'request.start', ts: '2026-04-01T12:00:00.000120000Z' },
  { nodeId: 'api-2', eventType: 'request.end', ts: '2026-04-01T12:00:00.000987654Z' },
];

// 1. Parse recorded timestamps as Temporal.Instant (never `new Date(ts)`,
// which drops everything below the millisecond).
const events = rawEvents.map(evt => ({
  ...evt,
  timestamp: Temporal.Instant.from(evt.ts),
}));

// 2. Sort chronologically with the static compare() method
function sequenceEvents(items) {
  // Instant.compare returns -1, 0, or 1, which is what sort() expects.
  return [...items].sort((a, b) => Temporal.Instant.compare(a.timestamp, b.timestamp));
}

// 3. Calculate and display the interval between consecutive events
function analyzeTrace(sortedEvents) {
  for (let i = 1; i < sortedEvents.length; i++) {
    const prev = sortedEvents[i - 1];
    const curr = sortedEvents[i];

    // since() returns a Temporal.Duration that retains nanosecond precision.
    const gap = curr.timestamp.since(prev.timestamp);

    // 4. toLocaleString() formats the duration for people (e.g., "3μs 456ns").
    // Avoid gap.total('nanoseconds'): spans over ~104 days exceed Number.MAX_SAFE_INTEGER.
    // 'en-US' is used here for deterministic output; pass undefined to use the user's locale.
    console.log(`${prev.eventType} → ${curr.eventType}: ${gap.toLocaleString('en-US', { style: 'narrow' })}`);
  }
}

analyzeTrace(sequenceEvents(events));
```


<a id="strategic-implementation--best-practices"></a>

## 实施策略与最佳实践

- **应当**用 `Temporal.Instant.from()` 解析基于同一时钟记录、且需要排序或求差的高精度时间戳（例如来自服务器、数据库或日志流水线）。与 `Temporal.PlainDateTime` 不同，`Temporal.Instant` 表示统一时间线上的无歧义时间点。
- **应当**保留来源记录的时间戳。浏览器中的 `Temporal.Now.instant()` 为缓解 Spectre 计时攻击和指纹识别，被限制为毫秒／微秒精度；本地客户端的亚毫秒间隔使用 `performance.now()` / `performance.mark()`，解析服务器或原生时钟的纳秒时间戳则使用 `Temporal.Instant.from()`。
- **应当**用 `Temporal.Instant.compare()` 排序，用 `a.equals(b)` 判断相等；不要检查 `Temporal.Instant.compare(a, b) === 0`，也不要比较 `.toString()` 的输出。
- **不要**用 `new Date()` 或 `Date.parse()` 解析高精度时间戳字符串来排序，因为它们会截断到毫秒并产生碰撞。
- **不要**把间隔折算成单个数值来显示。`duration.total('nanoseconds')` 返回 `Number`，当时间跨度超过约 104 天时，会超过 `Number.MAX_SAFE_INTEGER` 并静默丢失精度。对 `epochNanoseconds`（`BigInt`）相减虽然精确，却会丢失单位结构；应保留 `Temporal.Duration`，并用 `.toLocaleString()` 格式化。
- **应当**在需要向用户显示某个事件的本地墙上时钟时间时，通过 `instant.toZonedDateTimeISO(timeZone)` 将 `Instant` 转为 `Temporal.ZonedDateTime`。

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

