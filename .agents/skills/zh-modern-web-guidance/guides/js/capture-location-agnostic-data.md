<a id="capturing-location-agnostic-data-and-partial-dates-with-temporal"></a>

# 使用 Temporal 记录与位置无关的数据及不完整日期

使用旧的 `Date` 对象记录不应随查看者位置变化的时间数据，例如出生日期、每日闹钟、信用卡到期日或每月结算周期，历来容易出错。因为 `Date` 始终表示某个确切时刻，且按查看者的本地时区显示，所以保存 `"1990-01-01"` 这样的日期，可能让 UTC 以西的用户看到 `"1989-12-31"`；而表示不完整日期（例如只精确到月份的信用卡到期日）时，又不得不使用任意占位日期，进而引发溢出错误。

`Temporal` API 提供一组与位置无关的 **“Plain”类型**。它们不携带时区偏移，精确表示日历或时钟上读到的日期和墙上时钟时间：

| 类型 | 表示的内容 | 常见用途 |
|---|---|---|
| `Temporal.PlainDate` | 完整日历日期（`year`、`month`、`day`） | 出生日期、活动日期、订阅扣款日期 |
| `Temporal.PlainTime` | 墙上时钟时间（`hour`、`minute`、`second` 等） | 每日闹钟（用户身处何地都在上午 9 点响）、营业时间 |
| `Temporal.PlainDateTime` | 不含时区的日历日期 + 墙上时钟时间 | 随所在地变化的本地日程；附加时区前组合 `PlainDate` 和 `PlainTime` |
| `Temporal.PlainMonthDay` | 不含年份的月与日 | 每年重复的生日、纪念日、固定节日 |
| `Temporal.PlainYearMonth` | 不含日的年与月 | 信用卡到期年月（`2027-12`）、按月结算周期 |

<a id="how-to-implement"></a>

## 实现方法

1. **选择与数据匹配、范围最小的 `Temporal.Plain*` 类型**：
   - 完整日历日期使用 `Temporal.PlainDate.from()`，墙上时钟时间使用 `Temporal.PlainTime.from()`。
   - 要把日期和墙上时钟时间组合起来，但不绑定时区，使用 `Temporal.PlainDateTime.from()`（或 `plainDate.toPlainDateTime(plainTime)`）。
   - 不含年份的年度日期使用 `Temporal.PlainMonthDay.from()`，并在日期运算前通过 `.toPlainDate({ year })` 转为 `PlainDate`。
   - 年月值使用 `Temporal.PlainYearMonth.from()`，避免任意日数进入计算。
2. **构建 Plain 类型时注意 `calendar` 参数**：解析 ISO 字符串或用 `PlainDate.from({ year, month, day })` 构建时，默认日历为 ISO 8601（`'iso8601'`）。从属性对象构建 `PlainMonthDay` 或 `PlainYearMonth`，或处理非 ISO 日历时，应显式传入 `calendar`（例如 `{ month: 10, day: 31, calendar: 'iso8601' }`）。
3. **使用带 `overflow` 选项的 `.add()` 处理重复日历间隔**：调用 `plainDate.add({ months: 1 })` 默认采用 `{ overflow: 'constrain' }`，将 1 月 31 日这样的月末日期约束到 2 月 28 日或 29 日。如果无效目标日期应抛出 `RangeError`，而不是被约束，则传入 `{ overflow: 'reject' }`。

<a id="example-full-dates-wall-clock-times-and-plaindatetime"></a>

### 示例：完整日期、墙上时钟时间和 `PlainDateTime`

```javascript
// 1. Parse a calendar date and a wall-clock time from input strings
const birthdate = Temporal.PlainDate.from('1990-01-01');
const reminderTime = Temporal.PlainTime.from('09:00');

// Combine into a location-agnostic PlainDateTime without string interpolation
const localAppointment = birthdate.toPlainDateTime(reminderTime);

// 2. Display without time zone conversion; outputs the same date in any time zone
console.log(birthdate.toLocaleString('en-GB'));
console.log(localAppointment.toString()); // "1990-01-01T09:00:00"

// 3. Read calendar fields directly from the Plain type. A PlainDate already *is*
// a calendar date, so there is no need for the formatToParts() workaround that
// legacy Date code uses to recover year/month/day from an instant.
const { year, month, day } = birthdate;
```


<a id="example-partial-dates-plainmonthday-and-plainyearmonth"></a>

### 示例：不完整日期（`PlainMonthDay` 和 `PlainYearMonth`）

```javascript
// Annual recurring event (no year component)
// Include explicit calendar when constructing from an object
const annualHoliday = Temporal.PlainMonthDay.from({
  month: 10,
  day: 31,
  calendar: 'iso8601',
});

const today = Temporal.Now.plainDateISO();
const isToday = annualHoliday.equals(today.toPlainMonthDay());

// Convert PlainMonthDay to a PlainDate with a specific year before doing arithmetic,
// because month lengths (such as February) depend on whether the year is a leap year.
const occurrenceThisYear = annualHoliday.toPlainDate({ year: today.year });

// Monthly expiration (no day component, preventing day-of-month overflow bugs)
const cardExpiry = Temporal.PlainYearMonth.from({
  year: 2027,
  month: 12,
  calendar: 'iso8601',
});
const currentMonth = today.toPlainYearMonth();
const isExpired = Temporal.PlainYearMonth.compare(cardExpiry, currentMonth) < 0;
```


<a id="example-recurring-monthly-intervals-overflow-constrain-vs-reject"></a>

### 示例：重复的月份间隔（`overflow: 'constrain'` 与 `'reject'`）

```javascript
const billingStart = Temporal.PlainDate.from('2024-01-31');

// Default overflow: 'constrain' clamps Jan 31 + 1 month to the last valid day of February
const nextBilling = billingStart.add({ months: 1 }, { overflow: 'constrain' });
console.log(nextBilling.toString()); // "2024-02-29" (2024 is a leap year)

// Use overflow: 'reject' to throw a RangeError when the target day does not exist
try {
  billingStart.add({ months: 1 }, { overflow: 'reject' });
} catch (err) {
  // RangeError: day 31 does not exist in February
}
```


<a id="example-interoperating-with-legacy-date"></a>

### 示例：与旧 `Date` 互操作

旧的 `Date` 是时间戳（某个时刻），而不是日历日期。把 `"1990-01-01"` 保存为 `Date` 时，必须选择某一个时刻（通常是 UTC 零点），在 UTC 以西的时区读取它，就会得到 `"31/12/1989"`。如果某个库或 API 仍要求 `Date`，应显式通过 `Temporal.Instant` 转换，不要手工构造 ISO 字符串：

```javascript
// PlainDate -> Date: attach a time zone (time of day defaults to the start of
// that day) to get an Instant, then hand the epoch milliseconds to Date.
// 'UTC' is a deliberate choice and must be documented; any zone would do,
// but the stored instant depends on it.
const instant = birthdate.toZonedDateTime('UTC').toInstant();
const legacyDate = new Date(instant.epochMilliseconds);

// Date -> PlainDate: go back through Instant (legacyDate.toTemporalInstant()
// is equivalent), then project into an explicit time zone. The result depends
// on the zone, which is exactly the drift risk.
const viewedDate = Temporal.Instant.fromEpochMilliseconds(legacyDate.getTime())
  .toZonedDateTimeISO('America/New_York')
  .toPlainDate();

// Compare Plain types with .equals() (or Temporal.PlainDate.compare), not strings.
console.log(viewedDate.equals(birthdate)); // false: the calendar date drifted to 1989-12-31
```


<a id="strategic-implementation--best-practices"></a>

## 实施策略与最佳实践

- **应当**用 `Temporal.PlainDate` 表示完整日历日期，用 `Temporal.PlainTime` 表示墙上时钟时间，用 `Temporal.PlainDateTime` 表示无时区的本地日期时间组合，用 `Temporal.PlainMonthDay` 表示每年重复的日期，用 `Temporal.PlainYearMonth` 表示精确到年月的到期时间或结算周期。
- **不要**直接对 `Temporal.PlainMonthDay` 做运算；先通过 `.toPlainDate({ year })` 转为 `Temporal.PlainDate`，因为月份长度会随年份变化。
- **应当**在 `Temporal.PlainDate` 上使用 `.add()` 计算重复日历间隔，依靠 `overflow: 'constrain'`（默认值）约束月末日期，或用 `overflow: 'reject'` 在日期不存在时抛出 `RangeError`。
- **应当**在从对象构建 `PlainMonthDay` 或非 ISO Plain 类型时指定 `calendar`（如 `calendar: 'iso8601'`）。
- **不要**用 Plain 类型表示物理时间上的确切时刻（instant）。日志、事件时间戳或跨时区排期应使用 `Temporal.Instant` 或 `Temporal.ZonedDateTime`。
- **不要**根据手工构造的 ISO 字符串（如 `` `${date}T00:00:00Z` ``）创建 `Date` 对象。应从 `Temporal.Instant` 或 `Temporal.ZonedDateTime` 的 `epochMilliseconds` 生成 `Date`，并用 `Temporal.Instant.fromEpochMilliseconds(date.getTime())` 或 `date.toTemporalInstant()` 转回来，使时区假设明确。
- **不要**使用 `Intl.DateTimeFormat.prototype.formatToParts()` 提取或比较年、月、日。直接读取 Plain 类型的 `.year`、`.month`、`.day`，并用 `.equals()` 比较。
- **应当**用 IANA 名称（如 `America/New_York`）标识时区，绝不使用固定 UTC 偏移。偏移会因夏令时和法律变化而改变，因此 `"UTC-5"` 这样的标签在一年中的部分时间会出错。
- **应当**记住 `Temporal` 对象是**不可变的**。`.add()`、`.subtract()` 或 `.with()` 等方法始终返回具有新引用的新实例，不会就地修改原对象，所以可以安全地直接保存在响应式 UI 状态中。

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

