<a id="supporting-global-calendar-systems-with-temporal"></a>

# 使用 Temporal 支持全球日历系统

传统 JavaScript `Date` 对象基于向前延伸的公历，因此很难为依赖其他日历系统的用户构建应用，例如伊斯兰历（阴历）、希伯来历（阴阳历）或中国农历（阴阳历）。过去，开发者必须依赖复杂的第三方库或手动计算才能支持这些系统。

`Temporal` API 原生支持多种日历系统。通过给日期对象关联日历标识符，Temporal 可以原生处理不同文化背景所需的复杂运算和格式化。

<a id="how-to-implement"></a>

## 实现方法

使用 Temporal 支持全球日历系统时：

1. **关联日历（必须）：**创建或转换 Temporal 对象（如 `Temporal.PlainDate`）时，必须使用 `withCalendar()` 指定所需日历系统，才能进行对日历敏感的操作。
2. **使用稳定标识符（阴阳历必须）：**在阴阳历中跨年份标识特定月份时，必须使用 `monthCode`，而不是数字 `month` 索引。仅对使用闰月的日历采用这种方式，例如希伯来历和中国农历。
3. **遵守日历不变量（必须）：**遍历月份或日期时，不能假定固定值（如一年 12 个月或每月 31 天）。使用 `monthsInYear`、`daysInMonth` 等属性，确保代码适用于所有日历。
4. **使用考虑日历的比较（必须）：**比较特定日历系统内的日期时，必须使用 `Temporal.PlainDate.compare()`，不要手动比较年／月／日属性。这样才能在日历规则下正确处理时间先后顺序。

<a id="example-code-converting-and-iterating-calendars"></a>

## 代码示例：转换与遍历日历

```javascript
// 1. Helper to check calendar support
function isCalendarSupported(calendarId) {
  try {
    return Intl.supportedValuesOf('calendar').includes(calendarId);
  } catch {
    // Fallback for environments where supportedValuesOf is not available
    return false;
  }
}

// 2. Get current date in default ISO 8601 calendar
const isoDate = Temporal.Now.plainDateISO();

// 3. Convert to Hebrew calendar if supported
const calendarId = 'hebrew';
const targetDate = isCalendarSupported(calendarId) 
  ? isoDate.withCalendar(calendarId)
  : isoDate; // Fallback to ISO if not supported

if (targetDate.calendarId !== calendarId) {
  console.warn(`Calendar ${calendarId} not supported; falling back to ISO 8601`);
}

// 4. Log properties specific to the calendar
console.log(`Calendar: ${targetDate.calendarId}`);
console.log(`Year: ${targetDate.year}`);
console.log(`Month Code: ${targetDate.monthCode}`); // Stable across leap years

// 5. Safely iterate through months in the current year
for (let m = 1; m <= targetDate.monthsInYear; m++) {
  console.log(`Month ${m} has ${targetDate.with({ month: m }).daysInMonth} days.`);
}

// 6. Compare dates within the same calendar
const today = Temporal.Now.plainDateISO().withCalendar(targetDate.calendarId);
const comparison = Temporal.PlainDate.compare(targetDate, today);
const relative = comparison < 0 ? 'Past' : comparison > 0 ? 'Future' : 'Today';
console.log(`Timeline: ${relative}`);

// 7. Format for display using toLocaleString (including era for era-based calendars like 'japanese')
const localizedDisplay = targetDate.toLocaleString(`en-u-ca-${targetDate.calendarId}`, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  era: 'long'
});
```


<a id="strategic-implementation--best-practices"></a>

## 实施策略与最佳实践

- **应当**用 `monthsInYear` 作为月份循环的上界，不要假定为 12。
- **应当**在使用闰月的日历（如希伯来历或中国农历）中，用 `monthCode` 跨年份标识特定月份。
- **不要**假定 `date.month === 12` 表示一年最后一个月。使用 `date.month === date.monthsInYear`。
- **不要**假定 `inLeapYear === true` 意味着该年只多一天。在阴阳历中，可能会增加一整个闰月。
- **应当**用 `Temporal.PlainDate.compare()` 比较特定日历系统中的两个日期，而不是手动比较年／月／日属性。
- **应当**用 `toLocaleString()` 格式化面向用户的日期，而不是手动拼接字符串。
- **应当**在创建指定日历的 Temporal 对象前，通过 `Intl.supportedValuesOf('calendar')` 验证环境是否支持目标日历系统。
- **应当**注意某些日历（如伊斯兰历的一些变体）可能依赖目视观测，而非固定计算。`Temporal` API 遵循环境的 `Intl` 实现，后者通常采用计算近似。对于重要的文化或宗教日期计算，应请领域专家核实，或使用专门的库。
- **应当**在使用带纪元的日历（如日本历、佛历）时，通过 `toLocaleString()` 考虑纪元名称。

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

