<a id="javascript"></a>

# JavaScript

现代 JavaScript 和 Web 平台运行时提供了内置原语，用于深拷贝、不修改原集合的变换、异步协调、查询字符串解析、二进制文本编码和 DOM 修改。替换旧有的应用层变通写法（`JSON.parse(JSON.stringify(...))`、`[...arr].sort()`、用 `.reduce()` 累积的分组桶、手动 `AbortController` 定时器以及通过 `innerHTML = ''` 清空的循环），可以消除隐蔽的数据损坏、原型污染、调用栈溢出和不必要的解析器开销。

<a id="table-of-contents"></a>

## 目录

- [用例指南矩阵](#use-case-guide-matrix)

1. [不可变数据、深拷贝与分组](#1-immutable-data-deep-cloning-and-grouping)
   - [用 `structuredClone()` 深拷贝](#deep-cloning-with-structuredclone)
   - [不修改原数组的复制与反向查找](#non-mutating-array-copies-and-reverse-search)
   - [对可迭代集合分组（`Object.groupBy()` 和 `Map.groupBy()`）](#grouping-iterable-collections-objectgroupby-and-mapgroupby)
2. [异步协调、取消和错误链](#2-asynchronous-coordination-cancellation-and-error-chaining)
   - [在外部决定 Promise 的结果（`Promise.withResolvers()`）](#externalized-promise-settlement-promisewithresolvers)
   - [声明式超时和组合取消（`AbortSignal.timeout()` 和 `AbortSignal.any()`）](#declarative-timeout-and-composite-cancellation-abortsignaltimeout-and-abortsignalany)
   - [通过 Error cause 选项连接错误原因](#chaining-error-causes-with-error-cause-options)
3. [URL 查询操作与二进制文本编码](#3-url-query-manipulation-and-binary-text-encoding)
   - [解析与构建查询字符串（`URLSearchParams`）](#parsing-and-constructing-query-strings-urlsearchparams)
   - [二进制 UTF-8 文本解码与编码（`TextDecoder` 和 `TextEncoder`）](#binary-utf-8-text-decoding-and-encoding-textdecoder-and-textencoder)
4. [DOM 子节点替换与自定义事件](#4-dom-child-replacement-and-custom-events)
   - [原子替换与清空子节点（`Element.prototype.replaceChildren()`）](#atomic-child-replacement-and-clearing-elementprototypereplacechildren)
   - [构建标准事件和自定义事件（`new Event()` 和 `new CustomEvent()`）](#constructing-standard-and-custom-events-new-event-and-new-customevent)

<a id="use-case-guide-matrix"></a>

## 用例指南矩阵

对于专门的时间处理、排期和安全工作流，参考下列专项指南：

| 工作流／领域 | 指南 |
| :--- | :--- |
| 计算日期或事件之间精确的日历时长（`years`、`months`、`days`） | `calculate-event-differentials`（通过 `npx -y modern-web-guidance@latest retrieve "calculate-event-differentials"`） |
| 表示日历日期（`PlainDate`）、墙上时钟时间（`PlainTime`）或重复规则，避免时区偏移错误 | `capture-location-agnostic-data`（通过 `npx -y modern-web-guidance@latest retrieve "capture-location-agnostic-data"`） |
| 在 IANA 时区间转换时刻（`ZonedDateTime`），并消解 DST 歧义 | `coordinate-global-events`（通过 `npx -y modern-web-guidance@latest retrieve "coordinate-global-events"`） |
| 排序和比较纳秒精度时间戳（`Temporal.Instant.compare`） | `sort-high-precision-timestamps`（通过 `npx -y modern-web-guidance@latest retrieve "sort-high-precision-timestamps"`） |
| 将日期转换到非公历日历系统（`hebrew`、`islamic-civil`、`japanese`、`chinese`） | `support-global-calendar-systems`（通过 `npx -y modern-web-guidance@latest retrieve "support-global-calendar-systems"`） |
| 在插入 DOM 前清理不可信 HTML 字符串 | `sanitize-untrusted-html`（通过 `npx -y modern-web-guidance@latest retrieve "sanitize-untrusted-html"`） |

---

<a id="1-immutable-data-deep-cloning-and-grouping"></a>

## 1. 不可变数据、深拷贝与分组

<a id="deep-cloning-with-structuredclone"></a>

### 用 `structuredClone()` 深拷贝

使用 `structuredClone(value)` 深拷贝嵌套对象、数组和内置平台类型，无须先转为 JSON 字符串再解析回来。

<a id="guidelines"></a>

#### 指南

- **应当**在内存中复制结构化状态时，使用 `structuredClone(value)`，而不是 `JSON.parse(JSON.stringify(value))` 或递归克隆工具（`_.cloneDeep`）。
- **应当**依靠 `structuredClone()` 保留循环引用、共享对象引用（DAG）、`Date` 实例、`RegExp`、`Map`、`Set`、`ArrayBuffer`、`TypedArray`、`DataView`、`BigInt`、`Error` 实例、值为 `undefined` 的属性、`NaN`、`Infinity`、`-0` 以及稀疏数组空位。
- **应当**在转移 `ArrayBuffer` 或 `MessagePort` 实例所有权、且不复制底层字节时，传入 `{ transfer: [arrayBuffer] }` 选项对象。
- **不要**在调用方依赖 **JSON 传输格式规范化**或变换时，将 `JSON.parse(JSON.stringify(value))` 替换为 `structuredClone(value)`，包括：
  - 将 `Date` 实例转为 ISO-8601 字符串（`Date.prototype.toJSON()`），或执行 `JSON.stringify` 的 `replacer` 白名单／脱敏，或 `JSON.parse` 的 `reviver` 变换。
  - 调用对象自定义 `.toJSON()` 方法（`structuredClone()` 会忽略继承或不可枚举的 `.toJSON()` 方法；如果对象有自身可枚举的函数属性，如 `.toJSON` 或导入库的单例／选项对象方法，则抛出 `DataCloneError`）。
  - 移除值为 `undefined`、函数或 `Symbol` 的键，将 `NaN`、`Infinity`、`-Infinity` 和稀疏数组空位转为 `null`（以及将 `-0` 转为 `+0`），或有意打破共享 DAG 引用（使 `a.x !== a.y`，让调用方能独立修改原本互为别名的分支）。
- **不要**向 `structuredClone()` 传入不可克隆的值。以下情况会抛出 `DOMException`（`DataCloneError`）：
  - 函数，或具有自身可枚举方法的导入库单例／选项对象（而 `JSON.stringify` 会静默省略对象的函数属性，或将数组中的函数元素转为 `null`）。
  - `Symbol` 值或以 `Symbol` 为键的属性（`JSON.stringify` 会静默忽略它们）。
  - DOM 节点（`Element`、`Document`、`Node`）、实时浏览器／WebIDL 对象（`window.location`、`localStorage`、`element.dataset`（`DOMStringMap`）、`getComputedStyle(el)`（`CSSStyleDeclaration`）、DOM `Event`、`URLSearchParams`、`FormData`、`Headers`；但 `DOMRect` 等可序列化几何对象可以克隆）、`Promise`、`WeakMap`、`WeakSet` 或任何 `Proxy` 实例（包括通用 `Proxy` 包装器，以及 Vue `reactive()`、MobX observable 等响应式 store）。
- **不要**指望 `structuredClone()` 保留自定义类原型、类方法、不可枚举属性、属性描述符或 `#private` 字段。与 `JSON.parse(JSON.stringify(...))` 一样，`structuredClone()` 会把自定义原型链简化为 `Object.prototype`，丢弃不可枚举属性和 `#private` 字段，并对可枚举 getter 求值一次，转为普通数据属性。

> [!NOTE]
> `structuredClone` 是宿主提供的全局对象，而非 ECMAScript 语言内建全局对象。在隔离的 Node.js `vm.createContext({})` 沙箱，或不向上下文对象暴露宿主全局对象的旧式自定义测试环境中，如果不显式注入，`structuredClone` 可能为 `undefined`。

<a id="code-example"></a>

#### 代码示例

```js
const original = {
  id: 'session-42',
  createdAt: new Date('2026-03-15T12:00:00Z'),
  tags: new Set(['admin', 'audit']),
  metrics: new Float64Array([0.98, 0.99]),
  optionalNote: undefined,
};
original.self = original; // Circular reference

const copy = structuredClone(original);

console.assert(copy !== original);
console.assert(copy.createdAt instanceof Date);
console.assert(copy.tags instanceof Set && copy.tags !== original.tags);
console.assert(copy.self === copy);
console.assert('optionalNote' in copy && copy.optionalNote === undefined);
```


---

<a id="non-mutating-array-copies-and-reverse-search"></a>

### 不修改原数组的复制与反向查找

使用复制式数组方法（`.toSorted()`、`.toReversed()`、`.toSpliced()`、`.with()`）和反向查找方法（`.findLast()`、`.findLastIndex()`）变换或查询数组，既不修改源引用，也不分配中间浅拷贝。

<a id="guidelines-1"></a>

#### 指南

- **应当**使用 `array.toSorted(compareFn)`，而不是 `[...array].sort(compareFn)`、`array.slice().sort(compareFn)` 或 `Array.from(array).sort(compareFn)`。
- **应当**使用 `array.toReversed()`，而不是 `[...array].reverse()` 或 `array.slice().reverse()`。
- **应当**用 `array.toSpliced(start, deleteCount, ...items)` 做不可变插入、删除和替换，而不是先复制再调用 `.splice()`。
- **应当**用 `array.with(index, value)`（支持负索引）做单个索引的不可变更新，而不是先复制再赋值 `clone[index] = value`。
- **应当**使用 `array.findLast(predicate)` 和 `array.findLastIndex(predicate)`，而不是 `[...array].reverse().find(predicate)` 或手动反转索引。
- **不要**在未检查多参数回调和未命中时的 `-1` 运算前，重构 `arr.slice().reverse().findIndex(fn)`：`findLast()` / `findLastIndex()` 传给 `(item, index, arr)` 的是**原数组**正向 `index`，而非反转副本的索引；未命中时，`arr.length - 1 - (-1) === arr.length` 会得到越界索引，而 `findLastIndex()` 返回 `-1`。
- **不要**在接收对象是 `string`、非 Array 可迭代对象或类数组对象（`Set`、`Map.keys()`、`Map.values()`、generator、`NodeList`、`HTMLCollection` 或 `arguments`）时，省略 `[...iterable]` / `Array.from()` 转换。在 `string`、`Set` 或 `NodeList` 上直接调用 `.toSorted()` 或 `.toReversed()` 会抛出 `TypeError`；应先转换，再链接会修改数组的方法（如 `[...set].sort(compareFn)`、`[...nodeList].reverse()` 或 `Array.from(str).toReversed().join('')`），避免分配冗余副本。
- **不要**把 `[...typedArray].sort()` 替换为 `typedArray.toSorted()`，除非确实需要数值排序和 `TypedArray` 返回类型：
  - `Array.prototype.sort()` / `.toSorted()` 默认将元素转为 UTF-16 字符串（`[10, 2].toSorted()` 得到 `[10, 2]`），而 `%TypedArray%.prototype.toSorted()` 按数值排序（`new Uint8Array([10, 2]).toSorted()` 得到 `Uint8Array [2, 10]`），并返回 `TypedArray` 而非普通 `Array`。
  - `%TypedArray%.prototype` **没有**实现 `.toSpliced()`，因为 TypedArray 的字节长度固定。
- **不要**在代码有意依赖稀疏数组空位保留（`!(i in arr)`）时使用 `.toSorted()` 或 `.toReversed()`。复制式方法始终生成稠密数组，稀疏空位变为 `undefined` 元素（`0 in [, 1].toReversed()` 为 `true`），而 `Array.prototype.slice()`、`.sort()` 和 `.reverse()` 会保留空位。

<a id="code-example-1"></a>

#### 代码示例

```js
const tasks = [
  { id: 1, priority: 2, status: 'done' },
  { id: 2, priority: 5, status: 'open' },
  { id: 3, priority: 1, status: 'done' },
];

// Immutable sort and single-element update without mutating `tasks`
const byPriority = tasks.toSorted((a, b) => b.priority - a.priority);
const reopened = tasks.with(-1, { ...tasks.at(-1), status: 'open' });

// Reverse search without allocating a reversed copy
const lastCompleted = tasks.findLast((task) => task.status === 'done');
const lastCompletedIndex = tasks.findLastIndex((task) => task.status === 'done');
```


---

<a id="grouping-iterable-collections-objectgroupby-and-mapgroupby"></a>

### 对可迭代集合分组（`Object.groupBy()` 和 `Map.groupBy()`）

使用 `Object.groupBy(items, callbackFn)` 和 `Map.groupBy(items, callbackFn)`，一步将任意可迭代对象分成若干数组桶。

<a id="guidelines-2"></a>

#### 指南

- **应当**在使用字符串或 symbol 属性键分组，且各桶保存未修改的原始元素时，使用 `Object.groupBy(items, (item, index) => key)`，而不是 `items.reduce((acc, item) => { (acc[key] ??= []).push(item); return acc; }, {})`（`Object.groupBy()` 使用 `CreateDataProperty`，因此 `'constructor'` 或 `'toString'` 等键不会与 `Object.prototype` 冲突）。
- **应当**在按对象引用、类实例或必须保留非字符串类型（`number`、`boolean`、`undefined`、`BigInt`）而不能经 `ToPropertyKey` 强制转换的原始值键分组时，使用 `Map.groupBy(items, (item, index) => key)`（`Object.groupBy()` 使用 `String(key)` 转换键，会把对象变为 `'[object Object]'`）。
- **应当**在读取 `Object.groupBy()` 的桶时，使用 `Object.hasOwn(groups, key)` 或空值合并（`groups[key] ?? []`）。
- **不要**在 `Object.groupBy()` 的结果上调用 `Object.prototype` 方法（`groups.hasOwnProperty(key)`），也不要依赖 `grouped instanceof Object`：它返回原型为 `null` 的对象（`Object.getPrototypeOf(grouped) === null`、`grouped instanceof Object === false`），所以 `groups.hasOwnProperty` 为 `undefined`，调用它会抛出 `TypeError`。
- **不要**替换同时变换元素（`acc[key].push(item.id)`）、计算标量聚合（计数、求和、最小／最大值）或预置零匹配项空键的 `.reduce()` 累积器（`Object.groupBy()` 只创建在 `items` 中至少出现一次的键）。

<a id="code-example-2"></a>

#### 代码示例

```js
const deliveries = [
  { id: 'd1', region: 'eu-west', weightKg: 4.2 },
  { id: 'd2', region: 'us-east', weightKg: 1.1 },
  { id: 'd3', region: 'eu-west', weightKg: 8.5 },
];

// String-keyed null-prototype dictionary of arrays
const byRegion = Object.groupBy(deliveries, (item) => item.region);
const euShipments = byRegion['eu-west'] ?? [];

// Non-string or object keys preserved in a Map
const heavyKey = { tier: 'heavy' };
const standardKey = { tier: 'standard' };
const byTier = Map.groupBy(deliveries, (item) =>
  item.weightKg >= 5 ? heavyKey : standardKey,
);
```


---

<a id="2-asynchronous-coordination-cancellation-and-error-chaining"></a>

## 2. 异步协调、取消和错误链

<a id="externalized-promise-settlement-promisewithresolvers"></a>

### 在外部决定 Promise 的结果（`Promise.withResolvers()`）

如果 promise 的 `resolve` 和 `reject` 回调必须保存在 `new Promise` executor 作用域之外，或在外部调用（例如事件监听器、worker 消息处理器、流队列或取消令牌），使用 `Promise.withResolvers()`。

<a id="guidelines-3"></a>

#### 指南

- **应当**使用 `const { promise, resolve, reject } = Promise.withResolvers()`，而不是声明可变外部变量（`let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; });`）；构造 `Promise` 子类时，可使用 `Promise.withResolvers.call(SubPromise)`。
- **应当**在异步操作完全自包含于 executor 回调内时，保留标准 `new Promise((resolve, reject) => { ... })`。
- **不要**把同步设置代码从 `new Promise((resolve, reject) => { ... })` executor 移到 `Promise.withResolvers()` 之后，却不加上会调用 `reject(err)` 的 `try / catch`：executor 内的同步抛出会自动拒绝 promise，而 `Promise.withResolvers()` 之后的抛出会成为未捕获的同步异常。

<a id="code-example-3"></a>

#### 代码示例

```js
export function createRequestGate() {
  const { promise, resolve, reject } = Promise.withResolvers();
  return {
    waitUntilReady: () => promise,
    open: (config) => resolve(config),
    abort: (reason) => reject(new Error(`Gate aborted: ${reason}`)),
  };
}
```


---

<a id="declarative-timeout-and-composite-cancellation-abortsignaltimeout-and-abortsignalany"></a>

### 声明式超时和组合取消（`AbortSignal.timeout()` 和 `AbortSignal.any()`）

对有时间限制的异步操作使用 `AbortSignal.timeout(ms)`，通过 `AbortSignal.any(signals)` 组合多个取消来源，无须手动管理定时器。

<a id="guidelines-4"></a>

#### 指南

- **应当**直接向 `fetch()`、`addEventListener()`、流或可中止 API 传入 `{ signal: AbortSignal.timeout(ms) }`，而不是创建一次性的 `AbortController` 和 `setTimeout(() => controller.abort(), ms)`。
- **应当**通过 `AbortSignal.any([controller.signal, AbortSignal.timeout(ms)])` 组合用户主动取消（`AbortController`）和截止时间。只要第一个输入信号中止，组合信号就立即中止，并传播该信号的 `reason`。
- **应当**在需要区分用户取消和截止时间时，在 `catch` 中检查 `error.name` 的 `'TimeoutError'` 与 `'AbortError'` 两种值。
- **不要**假定 `AbortSignal.timeout(ms)` 中止时会令 `error.name === 'AbortError'`。不带参数的 `controller.abort()` 将 `signal.reason` 设置为 `DOMException(..., 'AbortError')`，而 `AbortSignal.timeout(ms)` 设置的是 `DOMException(..., 'TimeoutError')`（`error.name === 'TimeoutError'`、`err.code === DOMException.TIMEOUT_ERR` / `23`）。
- **不要**无参数调用 `AbortSignal.timeout(ms)` 或传入负延迟（省略 `ms` 会抛出 `TypeError`；负延迟会抛出 `RangeError` 或 `TypeError`）；不要指望 `AbortSignal.timeout(ms)` 自己维持 Node.js 事件循环存活（Node.js 使用取消引用的定时器）；也不要替换会随活动重置的手动 `AbortController` + `setTimeout` 定时器（滑动／空闲防抖），或需要在到期前使用自定义中止原因的定时器。

<a id="code-example-4"></a>

#### 代码示例

```js
export async function fetchJsonWithDeadline(url, userSignal, timeoutMs = 5_000) {
  const signal = userSignal
    ? AbortSignal.any([userSignal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`, { cause: err });
    }
    throw err;
  }
}
```


---

<a id="chaining-error-causes-with-error-cause-options"></a>

### 通过 Error cause 选项连接错误原因

跨架构层包装并重新抛出异常时，通过 `{ cause }` 选项参数附上原先捕获的错误。

<a id="guidelines-5"></a>

#### 指南

- **应当**将 `{ cause: err }` 作为第二个参数传给 `new Error(message, { cause: err })`（或内置子类：`TypeError`、`RangeError`、`SyntaxError`、`URIError`、`EvalError`、`AggregateError`）；自定义 `Error` 子类必须接收 `(message, options)` 并转发给 `super(message, options)`，以保留 `.cause`。
- **应当**在字符串拼接式重新抛出（`new Error('Failed: ' + err.message)`）仅用于代替结构化错误链时，改用 `new Error(message, { cause: err })`；如果调用方或测试会断言外层 `.message` 的子字符串，则在 `{ cause: err }` 之外仍保留插值 `${err.message}`。不要构造之后再修改 `wrapper.cause = err`，因为那会设置可枚举属性，而不是规范中的不可枚举属性。
- **不要**在底层错误包含敏感数据库查询、文件路径或凭据时，把原始内部 `cause` 链直接暴露给不可信客户端响应；应在服务器端记录完整 `error.cause` 链，并清理面向客户端的载荷。

<a id="code-example-5"></a>

#### 代码示例

```js
export class ProfileLoadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ProfileLoadError';
  }
}

export async function loadUserProfile(userId, readRecord) {
  try {
    const raw = await readRecord(`users:${userId}`);
    return JSON.parse(raw);
  } catch (err) {
    throw new ProfileLoadError(
      `Failed to load profile for user "${userId}": ${err.message}`,
      { cause: err },
    );
  }
}
```


---

<a id="3-url-query-manipulation-and-binary-text-encoding"></a>

## 3. URL 查询操作与二进制文本编码

<a id="parsing-and-constructing-query-strings-urlsearchparams"></a>

### 解析与构建查询字符串（`URLSearchParams`）

使用 `URLSearchParams`（以及 `new URL(input, base).searchParams`）解析、检查、修改和序列化查询字符串，替代手动 `.split('&')` / `.split('=')` 循环和 `decodeURIComponent`。

<a id="guidelines-6"></a>

#### 指南

- **应当**用 `new URLSearchParams(search)` 读取或修改参数（`.get(key)`、`.getAll(key)`、`.has(key)`、`.set(key, value)`、`.toString()`），或用 `Object.fromEntries(new URLSearchParams(search))` 转为普通键值字典。
- **应当**在输入为完整 URL 字符串（`https://example.com/path?a=1#section`）时，使用 `new URL(fullUrl, baseOrigin).searchParams`，而不是直接把完整 URL 传给 `new URLSearchParams(fullUrl)`（它只会移除一个开头的 `?`，并把 `https://example.com/path?a` 视为第一个键名的一部分）。
- **应当**依靠 `URLSearchParams` 保留参数值里的 `=` 字符（例如 Base64 填充 `?token=aGVsbG8=`，使用 `.split('=')[1]` 会截断），并在构建查找映射时避免 `Object.prototype` 污染。
- **应当**考虑 `URLSearchParams` 强制执行的 `application/x-www-form-urlencoded` 规则：
  - **加号（`+`）解码：**`URLSearchParams` 把 `+` 解码为空格（`' '`），而 `decodeURIComponent('a+b')` 保留 `a+b`。如果 `+` 必须保持字面含义（如电话号码、Base64），应在来源处编码为 `%2B`。
  - **无值标志（`?debug` 与 `?debug=`）：**两者都规范化为 `""`（`params.has('debug') === true`、`params.get('debug') === ''`），而自定义 `split('=')` 解析器有时赋值为 `undefined` 或 `true`。
  - **重复键（`?tag=a&tag=b`）：**`params.get('tag')` 返回**第一个**值（`'a'`），`Object.fromEntries(params)` 保留**最后一个**值（`'b'`），`params.getAll('tag')` 返回 `['a', 'b']`。
  - **无效百分号编码、方括号键和 `'??'`：**非十六进制转义（`%ZZ`）保留为字面值 `'%ZZ'`；无效 UTF-8 字节序列（`%E0%A4%A`）变为 `\uFFFD`，而不会抛出异常（如果必须严格拒绝格式错误的 URI，应保留 `try / catch` 内的 `decodeURIComponent`）；方括号键（`?ids[]=1&user[name]=alice`）保持为扁平的字面键；只会移除一个开头的 `?`（`new URLSearchParams('??a=1')` 将 `'?a'` 保留为第一个键）。
- **不要**把 `location.hash` 或 hash 路由片段直接传给 `new URLSearchParams(...)`：`URLSearchParams` 不会移除 `#`，因此 `'#tab=2'` 会被解析为键 `'#tab'`（应使用 `slice(1)`）；hash 路由片段（`'#/route?a=1'`）则需要先提取 `?` 之后的查询部分再解析（`hash.slice(hash.indexOf('?') + 1)`）。
- **不要**使用 `URLSearchParams` 解析分号分隔的字符串（如 `document.cookie` 或 RFC 6265 `Cookie` 头）；`URLSearchParams` 只按 `&` 分隔。

<a id="code-example-6"></a>

#### 代码示例

```js
// Parsing a query string into a plain object (last value wins on duplicate keys)
const query = '?filter=active&token=eyJhbGciOiJIUzI1NiJ9==&tag=js&tag=web';
const params = new URLSearchParams(query);

const token = params.get('token'); // 'eyJhbGciOiJIUzI1NiJ9==' (preserves trailing '==')
const allTags = params.getAll('tag'); // ['js', 'web']
const lastWinsDict = Object.fromEntries(params); // { filter: 'active', token: '...', tag: 'web' }

// Mutating query parameters on a full URL safely
const endpoint = new URL('https://api.example.com/v1/items?page=1#results');
endpoint.searchParams.set('page', '2');
endpoint.searchParams.append('limit', '50');
```


---

<a id="binary-utf-8-text-decoding-and-encoding-textdecoder-and-textencoder"></a>

### 二进制 UTF-8 文本解码与编码（`TextDecoder` 和 `TextEncoder`）

使用 `TextDecoder` 和 `TextEncoder` 在 `Uint8Array` 字节缓冲区与 JavaScript 字符串之间转换。

<a id="guidelines-7"></a>

#### 指南

- **应当**在将 UTF-8 字节缓冲区解码为文本时，使用 `new TextDecoder().decode(bytes)`，而不是 `decodeURIComponent(escape(binaryString))`、`String.fromCharCode.apply(null, bytes)` 或 `String.fromCharCode(...bytes)`（`String.fromCharCode` 会把字节视为 UTF-16 码元，把多字节 UTF-8 损坏成 Latin-1 乱码，并在约 65 KB 以上使调用栈溢出；而 `Uint16Array` 中 `> 0xFF` 的元素表示 16 位码元，并非原始 UTF-8 字节）。
- **应当**用 `new TextEncoder().encode(str)` 将字符串编码为 UTF-8 `Uint8Array` 字节数组，替代手动字符编码循环。
- **应当**对分块流（`ReadableStream`、WebSocket 帧、文件分块）复用同一个 `TextDecoder` 实例，使用 `decoder.decode(chunk, { stream: true })`，最后再调用一次 `decoder.decode()` 刷出剩余数据，使跨分块边界的多字节码点能够正确重组。
- **应当**在无效 UTF-8 序列必须抛出 `TypeError` 而非产生 `\uFFFD` 时，传入 `{ fatal: true }`（注意是 `TypeError` 而不是 `URIError`；而 `decoder.decode(string)` 始终会抛出 `TypeError`）；如果不希望开头的 UTF-8 BOM（`0xEF 0xBB 0xBF`）按默认行为被移除，则传入 `{ ignoreBOM: true }`。
- **应当**只在需要对大型缓冲区做每字符一字节的映射、且不受调用栈限制时，使用 `new TextDecoder('latin1')`（或 `'iso-8859-1'`）。注意，按 WHATWG Encoding，这两个标签都映射到 `windows-1252`（字节 `0x80`–`0x9F` 会解码为 `€`（`\u20AC`）等字符，而不是 `\u0080`–`\u009F`）。
- **不要**在为 `btoa()` / `atob()` 构造每码元一字节的原始二进制字符串（`0x00`–`0xFF`）时，把 `String.fromCharCode` 替换为 `new TextDecoder('utf-8')`：UTF-8 文本载荷使用 `TextEncoder` / `TextDecoder`；传给 `btoa()` 的原始二进制字符串使用分块 `String.fromCharCode`（或 Node.js 的 `Buffer.from(bytes).toString('base64')`），因为把多字节 UTF-8 的 `TextDecoder` 输出传给 `btoa()` 会抛出 `InvalidCharacterError`。

<a id="code-example-7"></a>

#### 代码示例

```js
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

// Encode string to UTF-8 Uint8Array and decode back without stack limits
const bytes = encoder.encode('🚀 Modern Web Platform — 100% UTF-8');
const text = decoder.decode(bytes);

// Streaming decode across arbitrary chunk boundaries
export async function readUtf8Stream(readableStream) {
  const streamDecoder = new TextDecoder();
  let output = '';
  for await (const chunk of readableStream) {
    output += streamDecoder.decode(chunk, { stream: true });
  }
  output += streamDecoder.decode(); // Flush any trailing bytes
  return output;
}
```


---

<a id="4-dom-child-replacement-and-custom-events"></a>

## 4. DOM 子节点替换与自定义事件

<a id="atomic-child-replacement-and-clearing-elementprototypereplacechildren"></a>

### 原子替换与清空子节点（`Element.prototype.replaceChildren()`）

使用 `element.replaceChildren(...nodesOrStrings)`，通过一次操作清空容器或替换它的所有现有子节点。

<a id="guidelines-8"></a>

#### 指南

- **应当**不带参数调用 `container.replaceChildren()` 来删除所有 `childNodes`，而不是使用 `container.innerHTML = ''`（会调用 HTML 解析器，并在 Trusted Types 下失败）或逐个删除子节点的循环（对实时 `children` / `childNodes` 使用正向 `for` 循环，会隔一个节点漏掉一个；`replaceChildren()` 会把修改批量合并成单条 `MutationObserver` `childList` 记录，对已经为空的元素则产生 `0` 条记录，并通过 `[CEReactions]` 在全部移除完成后触发 Custom Element 的 `disconnectedCallback()`，而非每移除一个节点就交错触发）。
- **应当**调用 `container.replaceChildren(...nodes)`，原子地清空并插入新的 `Node` 实例或 `DocumentFragment`（`HierarchyRequestError` 预验证会在修改现有子节点前原子失败）。
- **应当**在插入不解析 HTML 的字面文本时，直接向 `container.replaceChildren(text)` 传入普通字符串（注意，`el.replaceChildren('')` 会插入空 `Text` 节点，使 `childNodes.length === 1`，这与 `el.replaceChildren()` 不同）。
- **应当**在清空或替换 `<template>` 元素内容时，操作 `templateElement.content.replaceChildren(...)`（调用 `templateElement.replaceChildren()` 不会改变其惰性的 `content` `DocumentFragment`）；在 TypeScript 中，应将 `Node` 引用收窄为 `ParentNode`（`Element`、`Document`、`DocumentFragment`），因为叶子 `Node`（`Text`、`Comment`）不实现 `replaceChildren()`。
- **不要**在必须保留内联 `Text` 或 `Comment` 节点时，替换 `while (el.firstElementChild) el.removeChild(el.firstElementChild)`（`replaceChildren()` 会移除所有 `childNodes`）；不要替换链式赋值（`a.innerHTML = b.innerHTML = ''`，因为 `replaceChildren()` 返回 `undefined`）；不要传入原始 HTML 标记字符串（`'<li>Item</li>'`）并期待得到解析后的元素（对不可信 HTML 字符串，请遵循 `sanitize-untrusted-html`，通过 `npx -y modern-web-guidance@latest retrieve "sanitize-untrusted-html"` 获取）；当 `source` 必须保留副本时，不要传入实时 `HTMLCollection` / `NodeList`（`source.children`）；也不要替换 `<object>` 或 `<embed>` 插件容器中的 `element.innerHTML = ''`，或断言 HTML 解析步骤的测试框架中的该写法。

<a id="code-example-8"></a>

#### 代码示例

```js
export function renderNotificationList(listElement, messages) {
  const items = messages.map((msg) => {
    const li = document.createElement('li');
    li.className = 'notification-item';
    li.textContent = msg;
    return li;
  });

  // Atomically replaces all existing <li> children in a single DOM operation
  listElement.replaceChildren(...items);
}

// Clearing a <template> element's inert DocumentFragment
export function clearTemplate(templateEl) {
  templateEl.content.replaceChildren();
}
```


---

<a id="constructing-standard-and-custom-events-new-event-and-new-customevent"></a>

### 构建标准事件和自定义事件（`new Event()` 和 `new CustomEvent()`）

使用 `new Event(type, options)`、`new CustomEvent(type, options)` 和专门的 WebIDL 事件构造函数，替代已弃用的 `document.createEvent()` 及 `initEvent()` / `initCustomEvent()` 方法。

<a id="guidelines-9"></a>

#### 指南

- **应当**对标准通知使用 `new Event(type, { bubbles, cancelable, composed })`，对结构化 `event.detail` 载荷使用 `new CustomEvent(type, { detail, bubbles, cancelable, composed })`；替换 `initMouseEvent` / `initKeyboardEvent` / `initUIEvent` 时，使用专门的 WebIDL 构造函数（`new MouseEvent()`、`new KeyboardEvent()`、`new UIEvent()`），避免旧 `initKeyboardEvent` 参数的特殊行为和只读 `keyCode === 0` 问题。
- **应当**在事件必须沿 DOM 树冒泡或支持 `event.preventDefault()` 时，显式设置 `bubbles: true` 和 `cancelable: true`（两者默认都是 `false`）；需要跨越 Shadow DOM 边界时，设置 `composed: true`。
- **不要**使用 `document.createEvent('Event')`、`document.createEvent('CustomEvent')`、`event.initEvent()` 或 `event.initCustomEvent()`；也不要给 WebIDL 字典字段传入非 `EventTarget` 值（例如 `MouseEventInit` 中的 `relatedTarget: 0` 会抛出 `TypeError`）。

<a id="code-example-9"></a>

#### 代码示例

```js
// Dispatching a bubbling, shadow-piercing custom event with payload data
export function notifyFilterChange(filterPanel) {
  const filterChanged = new CustomEvent('filter-change', {
    detail: { category: 'architecture', minScore: 80 },
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  return filterPanel.dispatchEvent(filterChanged);
}
```

