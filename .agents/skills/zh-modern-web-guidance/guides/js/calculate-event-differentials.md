<a id="calculating-event-differentials-and-formatting-durations-with-temporal"></a>

# 使用 Temporal 计算事件时间差并格式化时长

过去，计算事件之间已经过去或剩余的时间（例如试用到期、订阅倒计时或 SLA 时间窗口），并以本地化、便于阅读的形式展示这些时长，通常需要手动运算或外部库。旧的 `Date` 对象只跟踪纪元毫秒数，因此按日历月计算、处理夏令时（DST）切换和换算单位都容易出错。

`Temporal` API 将 `Temporal.ZonedDateTime` 与 `Temporal.Duration`、`Intl.DurationFormat` 结合，提供能够正确处理 DST 的时间差计算、可配置的单位换算、考虑日历的时长比较，以及本地化格式化。

<a id="how-to-implement"></a>

## 实现方法

1. **取得起止两端的 `Temporal.ZonedDateTime`**：使用 `Temporal.Now.zonedDateTimeISO()` 获取系统时区中的当前时间；如果目标事件的时区与用户系统默认时区不同，则显式传入 IANA 时区字符串，即 `Temporal.Now.zonedDateTimeISO(timeZone)`。
2. **通过 `.since()` 和 `.until()` 计算时间差**：
   - 使用 `now.since(start, options)` 计算自过去某个事件以来经过的时间。
   - 使用 `now.until(end, options)` 计算距离未来某个事件剩余的时间。
   - 传入 `largestUnit`（如 `'year'`、`'month'`、`'day'`、`'hour'`）和 `smallestUnit`（如 `'minute'`），对所得 `Temporal.Duration` 做单位换算和舍入。
3. **换算或比较独立的 `Temporal.Duration` 对象**：
   - 使用 `Temporal.Duration.from({ minutes: 90 })` 创建独立时长，并通过 `duration.round({ largestUnit: 'hour' })` 重新换算单位（跨日历月、年或 DST 切换换算时，提供 `relativeTo`）。
   - 通过 `Temporal.Duration.compare(d1, d2, { relativeTo })` 比较两个时长；只要任意时长包含日历单位（`years`、`months`、`weeks`）或跨越 DST 边界，就必须传入 `PlainDate` 或 `ZonedDateTime` 作为 `relativeTo`。
4. **区分面向用户与机器的格式化**：
   - 面向用户的本地化文本使用 `duration.toLocaleString(locale, options)`（它委托给 `Intl.DurationFormat`）。
   - `duration.toString()` 只用于机器可读的 ISO 8601 时长字符串（如 `P1M2DT4H`）。

<a id="example-trial-expiration-differential-and-localized-formatting"></a>

### 示例：试用到期时间差与本地化格式化

```javascript
// 1. Get the current time in an explicit target IANA time zone (or omit the
// argument to use the system's current time zone).
const tz = 'America/New_York';
const now = Temporal.Now.zonedDateTimeISO(tz);

// 2. Combine separate date and time strings directly.
// Do not build an ISO string with template literals; chain Temporal methods instead.
const startDateStr = '2025-01-01';
const startTimeStr = '12:00:00';
const endDateStr = '2025-01-31';
const endTimeStr = '12:00:00';

const start = Temporal.PlainDate.from(startDateStr).toPlainDateTime(startTimeStr).toZonedDateTime(tz);
const end = Temporal.PlainDate.from(endDateStr).toPlainDateTime(endTimeStr).toZonedDateTime(tz);

// 3. Calculate differences using .since() and .until()
// ZonedDateTime differences default to largestUnit: 'hour' (days are not a fixed
// length across DST, so Temporal won't balance into days unless asked). Pass
// largestUnit: 'day' or a calendar unit ('week', 'month', 'year') when you want a
// human-scale breakdown instead of e.g. PT720H. smallestUnit rounds away
// seconds and sub-second noise so the formatted string stays readable.
const timeActive = now.since(start, { largestUnit: 'year', smallestUnit: 'minute' });
const timeRemaining = now.until(end, { largestUnit: 'year', smallestUnit: 'minute' });

// 4. Format durations for display with .toLocaleString() (Intl.DurationFormat)
// instead of manually concatenating unit numbers and suffixes. 'en-US' is used
// here for deterministic output; pass undefined to use the user's locale.
console.log(`Active: ${timeActive.toLocaleString('en-US', { style: 'narrow' })}`);
console.log(`Remaining: ${timeRemaining.toLocaleString('en-US', { style: 'long' })}`);

// Use .toString() for ISO 8601 serialization (e.g., API payloads or <time datetime="...">)
console.log(`ISO 8601: ${timeRemaining.toString()}`);

// 5. Check status via .sign, and compare durations with Temporal.Duration.compare()
const isExpired = timeRemaining.sign < 0;
// Pass relativeTo when comparing durations that may include calendar months/years or DST shifts
const isPastHalfway = Temporal.Duration.compare(timeActive, timeRemaining, { relativeTo: now }) > 0;
```


<a id="example-balancing-standalone-durations-round-and-intldurationformat"></a>

### 示例：换算独立时长（`round` 和 `Intl.DurationFormat`）

```javascript
// Convert a raw unit count (e.g., 90 minutes) into a balanced breakdown (1 hour, 30 minutes)
const rawDuration = Temporal.Duration.from({ minutes: 90 });
const balanced = rawDuration.round({ largestUnit: 'hour' });

// Format via duration.toLocaleString() or directly with Intl.DurationFormat
const formatter = new Intl.DurationFormat('en-US', { style: 'long' });
console.log(formatter.format(balanced)); // "1 hour, 30 minutes"
```


<a id="strategic-implementation--best-practices"></a>

## 实施策略与最佳实践

- **应当**使用 `Temporal.ZonedDateTime` 计算发生在具体时区的现实事件（如订阅续费或事件倒计时）；针对系统默认时区以外的时区计算时，向 `Temporal.Now.zonedDateTimeISO(timeZone)` 显式传入 `timeZone`。
- **应当**使用 Temporal 方法组合独立的日期和时间字符串，例如 `Temporal.PlainDate.from(dateStr).toPlainDateTime(timeStr).toZonedDateTime(tz)` 或 `Temporal.PlainDate.from(dateStr).toZonedDateTime({ timeZone: tz, plainTime: timeStr })`，不要用 `` `${dateStr}T${timeStr}` `` 之类的插值拼接 ISO 字符串。
- **应当**在希望把时长换算到小时以上单位时，向 `.since()`、`.until()` 或 `.round()` 传入 `largestUnit`（例如 `'day'`、`'month'`、`'year'`）；`ZonedDateTime` 的时间差方法默认为 `'hour'`。
- **应当**通过 `Temporal.Duration.compare(d1, d2, { relativeTo })` 比较两个时长；只要任意时长涉及日历单位（`months`、`years`）或带时区的天数，就提供 `relativeTo` 作为锚点。
- **应当**使用 `duration.toLocaleString()` 或 `new Intl.DurationFormat(locale, { style })`（`'long'`、`'short'`、`'narrow'` 或 `'digital'`）格式化面向用户的时长，而不是手动插值 `${duration.years}y ${duration.months}m...`。
- **应当**用 `duration.toString()` 生成机器可读的 ISO 8601 时长字符串（如 `PT1H30M`），绝不将其直接用作面向用户的文案。
- **应当**通过 `.toPlainTime().toString({ smallestUnit: 'minute' })` 将 `PlainTime` 渲染成 `HH:MM`（例如用于 `<input type="time">`），不要用字符串 `.slice(0, 5)`。
- **不要**直接修改实例；`Temporal` 对象是**不可变的**。`.add()`、`.subtract()`、`.round()` 或 `.with()` 等操作会返回新实例。
- **不要**在计算时间差本身时回退到 `Date` / `.getTime()` 运算；`Date` 不提供考虑时区的日历计算，而且只有毫秒精度。
- **应当**通过计算得到的 `Temporal.Duration` 的原生 `.sign` 属性（或 `Temporal.ZonedDateTime.compare()`），判断时长代表过去／已到期的时间点（`sign < 0`），还是尚待开始的未来时间。

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


<a id="intldurationformat"></a>

### Intl.DurationFormat

Intl.DurationFormat 的 Baseline 状态：新近可用。它自 2025-03-04 起进入 Baseline。
支持的浏览器：Chrome 129（2024 年 9 月）、Edge 129（2024 年 9 月）、Firefox 136（2025 年 3 月）和 Safari 16.4（2023 年 3 月）。
