<a id="agentic-javascript-tools"></a>

# 面向 agent 的 JavaScript 工具

命令式 API 使用 `document.modelContext.registerTool()` 以编程方式定义 JavaScript 工具。它特别适合单页应用（SPA）：这些应用需要依据当前路由或用户状态添加或移除工具。

WebMCP 采用生产者／消费者架构：

* **网页是工具生产者：**通过 `document.modelContext.registerTool()` 定义并注册工具。网页只需要实现这些。**为了向 agent 暴露工具，不需要在页面中调用 `getTools()` 或 `executeTool()`。**
* **浏览器和扩展 agent 是主要消费者：**由浏览器提供或通过浏览器运行的 agent，包括浏览器内置 agent、浏览器扩展、DevTools 和系统级助手，通过平台内部机制在页面代码之外发现和调用已注册工具。
* **页面内 agent 与测试框架：**`getTools()` 和 `executeTool()` 专门用于页面内的 JavaScript 助手（例如嵌入式聊天组件或 `<iframe>`），以及需要直接在页面上下文中发现和调用工具的自动化测试套件。

<a id="registration-and-lifecycle"></a>

## 注册与生命周期

注册工具时传入工具定义对象，以及可选的选项对象（`ModelContextRegisterToolOptions`）。该选项对象支持两个可选成员：

* `signal`：一个 `AbortSignal`，工具不再需要时，用于注销工具。
* `exposedTo`：源字符串数组，控制文档树中哪些文档可以跨框架边界发现并执行该工具。

<a id="lifecycle-handling-with-abortcontroller"></a>

### 使用 `AbortController` 处理生命周期

WebMCP 不提供 `unregisterTool()` 方法。要注销工具，必须在注册时传入 `AbortSignal`，并在不再需要工具时中止该信号。

```javascript
const controller = new AbortController();

await document.modelContext.registerTool({
  name: "get_user_preferences",
  description: "Retrieves the user's saved preferences.",
  inputSchema: { type: "object", properties: {} },
  execute() {
    const prefs = localStorage.getItem("user_prefs");
    return prefs ? JSON.parse(prefs) : { theme: "light" };
  },
  annotations: { readOnlyHint: true }
}, { signal: controller.signal });

// To unregister the tool (e.g., on component unmount):
controller.abort();
```


中止注册信号只会注销工具，不会取消已在运行的执行。启动长时间运行任务的工具，还必须遵守下文介绍的每次执行信号，否则注销后会留下无人管理的请求和过期的 UI 更新。

<a id="controlling-cross-origin-tool-exposure-with-exposedto"></a>

### 使用 `exposedTo` 控制跨源工具暴露

默认情况下，注册的工具只对注册它的文档及同源框架可见。当应用嵌入 `<iframe>`（或嵌入第三方组件）且需要祖先或兄弟框架发现并调用工具时，通过 `exposedTo` 指定允许的源。

```javascript
const controller = new AbortController();

await document.modelContext.registerTool({
  name: "get_cart_items",
  description: "Retrieves items currently in the user's shopping cart.",
  inputSchema: { type: "object", properties: {} },
  async execute(input, { signal }) {
    return await cartService.getItems({ signal });
  },
  annotations: { readOnlyHint: true },
}, {
  signal: controller.signal,
  exposedTo: ["https://checkout.example.com"],
});
```


* **双方选择加入的握手**：跨源工具发现要求双方主动同意。工具提供方框架通过 `exposedTo` 授权消费者的源，而消费者框架必须通过 `getTools({ fromOrigins: [...] })` 显式请求该提供方的源。未指定 `fromOrigins` 时，`getTools()` 只查询同源文档。
* **源匹配**：注册文档自身的源始终拥有访问权。`exposedTo` 中指定的源，可以通过 `document.modelContext.getTools({ fromOrigins: [...] })` 发现工具，并通过 `document.modelContext.executeTool()` 执行它。
* **安全要求**：`exposedTo` 中的每个源都必须是潜在可信的源（HTTPS 或 localhost）。传入无效或不安全的源，会使 `registerTool()` 以 `SecurityError` 拒绝。
* **作用范围**：`exposedTo` 控制页面内、跨文档树中框架的工具发现。

<a id="defining-parameters"></a>

## 定义参数

通过 `inputSchema` 属性定义参数（params）。该属性必须是 **JSON Schema** 对象，用于描述工具预期接收的结构化数据。

```javascript
await document.modelContext.registerTool({
  name: "calculate_area",
  description: "Calculates the area of a rectangle.",
  inputSchema: {
    type: "object",
    properties: {
      width: { type: "number", description: "The width of the rectangle." },
      height: { type: "number", description: "The height of the rectangle." }
    },
    required: ["width", "height"]
  },
  execute(input) {
    // input is { width: 10, height: 20 }
    return input.width * input.height;
  },
  annotations: { readOnlyHint: true }
});
```


<a id="writing-tool-and-parameter-descriptions"></a>

## 编写工具与参数描述

agent 已经会收到完整 `inputSchema`，因此 `description` 只需说明工具做什么、何时使用。**不要**在其中重复参数名称、类型、`enum` 值、默认值或限制；应在 schema 中声明这些内容（`enum`、`default`、`minimum` / `maximum`）。参数描述也遵循同一规则：说明值的含义，而非类型或允许的值。

浏览器不会依据 `inputSchema` 验证参数，也不会应用 `default` 值，因此这两件事都应在 `execute` 中完成。

```javascript
const SORT_ORDERS = ["newest", "price_low_to_high"];

await document.modelContext.registerTool({
  name: "search_products",
  // Don't list the sort orders here, even via SORT_ORDERS: `enum` already does.
  description: "Searches the product catalog by keyword. Use when the user wants to find or compare products.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Words to search for." },
      sort: { type: "string", enum: SORT_ORDERS, default: "newest", description: "Order of the results." },
    },
    required: ["query"],
  },
  async execute({ query, sort = "newest" }, { signal }) {
    if (typeof query !== "string" || !SORT_ORDERS.includes(sort)) {
      return { error: "Pass a search query and a supported sort order.", sortOrders: SORT_ORDERS };
    }
    return await productService.search({ query, sort }, { signal });
  },
  annotations: { readOnlyHint: true },
});
```


<a id="execution-patterns"></a>

## 执行模式

`execute` 回调始终接收两个参数：输入对象，以及携带 `AbortSignal` 的选项对象，即 `execute(inputObject, { signal })`。

<a id="when-to-use-async-execute"></a>

### 何时使用 `async execute`

如果工具涉及返回 Promise 或需要一定时间才能完成的操作，应使用 `async`：

- **网络调用**：从 API 获取数据。
- **异步存储**：访问 IndexedDB。
- **外部事件**：等待特定状态变化或动画完成。

```javascript
async execute(input, { signal }) {
  const response = await fetch(`/api/data/${input.id}`, { signal });
  return await response.json();
}
```


<a id="when-to-use-execute-synchronous"></a>

### 何时使用 `execute`（同步）

对于立即完成的操作，使用标准同步函数。同步工具会在能够观察到取消之前执行完毕，因此可以忽略信号：

- **纯逻辑**：对内存中的数据做数学计算、筛选或排序。
- **同步状态**：读取 `localStorage` 或同步状态管理器。

```javascript
execute(input) {
  return input.items.filter(item => item.active);
}
```


<a id="handling-errors-in-execute"></a>

### 处理 `execute` 中的错误

当 `execute` 抛出异常（或返回被拒绝的 promise）时，agent 只会收到通用的执行失败信息，不会得到错误消息。如果工具遇到可以采取行动或可以恢复的错误（例如输入无效、项目缺失或 HTTP 状态失败），**不要**使用 `throw new Error(...)`。应通过工具的正常返回值提供结构化错误载荷，让 AI agent 收到诊断详情，从而自行纠正或重试：

```javascript
execute({ itemName }) {
  const item = menuItems.find((entry) => entry.name.toLowerCase() === itemName.toLowerCase());
  if (!item) {
    // Return the error as a value instead of throwing, so the agent receives the message:
    return {
      error: `Menu item "${itemName}" not found.`,
      availableItems: menuItems.map((entry) => entry.name),
    };
  }
  return item;
}
```


只有在执行被取消时（`signal.aborted` 为 `true`），才重新抛出异常。

<a id="cancelling-in-flight-executions"></a>

### 取消执行中的操作

用户或 agent 可以发起取消。**必须遵守：**任何执行网络请求或其他长时间异步工作的工具，都必须遵守 `signal`；否则取消后的执行仍会消耗资源，并且可能在 agent 已转向其他任务后，把过期数据写入 UI。

* **接受 signal 的 API**（`fetch()`、`addEventListener()`、`ReadableStream` reader）：直接传递 `signal`。
* **不接受 signal 的 API**（`setTimeout`、`setInterval`、轮询循环、包含大量 `await` 的流水线）：在步骤之间调用 `signal.throwIfAborted()`，并且／或者在 `signal.addEventListener('abort', ...)` 中拒绝。定时器不接受 signal，因此必须在 abort 监听器中自行清除。

```javascript
await document.modelContext.registerTool({
  name: "fetch_tool",
  description: "Fetch the text content of a URL and show it on the page.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch" },
      priority: {
        type: "string",
        enum: ["high", "low", "auto"],
        description: "Relative network priority for the request",
      },
    },
    required: ["url"],
  },
  execute: async ({ url, priority }, { signal }) => {
    const output = document.querySelector("pre");
    output.textContent = "Loading…";
    try {
      // Passing `signal` aborts the network request the moment execution is cancelled.
      const response = await fetch(url, { priority, signal });
      if (!response.ok) {
        output.textContent = "";
        return { error: `Request failed with status ${response.status}` };
      }
      const text = await response.text();
      output.textContent = text;
      return text;
    } catch (err) {
      // Roll back the UI state this execution set, so a cancelled run leaves no trace.
      output.textContent = "";
      if (signal.aborted) {
        // The execution was cancelled: re-throw instead of returning an error value.
        throw err;
      }
      // Return other errors as a value instead of throwing, so the agent receives the message.
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
  annotations: { readOnlyHint: true }
});
```


<a id="flagging-consequential-tools"></a>

## 标记会产生重大后果的工具

从 Chrome 154 开始，`annotations` 支持 `consequentialHint`。对于会执行高风险、不可逆或现实世界操作的工具，例如预订旅行、转移资金、发送消息或删除数据，将其设为 `true`。这会提示 agent 在执行前请求用户明确确认。

```javascript
await document.modelContext.registerTool({
  name: 'book_flight',
  description: 'Book a flight for the user with confirmed flight details.',
  inputSchema: {
    type: 'object',
    properties: {
      flightId: { type: 'string', description: 'ID of the flight to book' },
      passengers: { type: 'number', description: 'Number of tickets to purchase' },
    },
    required: ['flightId', 'passengers'],
  },
  execute: async ({ flightId, passengers }, { signal }) => {
    // Forward `signal` to the transaction API to honor cancellation:
    return await bookFlightReservation({ flightId, passengers }, { signal });
  },
  annotations: {
    readOnlyHint: false,      // This tool mutates state (it makes a booking).
    consequentialHint: true,  // Spends money and is not trivially reversible.
    untrustedContentHint: false, // Output is first-party data, not third-party content.
  }
});
```


**必须遵守：**将 `consequentialHint` 视为提示，而不是强制执行机制。它本身不会阻止执行，早于该提示引入版本的浏览器也完全不会提示。保留该操作原本需要的应用内确认。

<a id="flagging-debugging-tools"></a>

## 标记调试工具

从 Chrome 156 开始，`annotations` 支持 `debugging`。对于为调试和开发工具用途构建、而非面向最终用户任务的工具，将 `annotations.debugging` 设为 `true`。例如：导出应用内部状态、切换功能标志或填充测试数据。这让 agent 能区分开发者专用工具和代用户执行操作的工具。默认值为 `false`。页面内 agent 和测试框架可以通过 `getTools()`，从 `RegisteredTool.annotations.debugging` 读取它。

```javascript
await document.modelContext.registerTool({
  name: "dump_app_state",
  description: "Returns a snapshot of the internal application store for debugging.",
  execute() {
    return appStore.getState();
  },
  annotations: {
    readOnlyHint: true, // Only reads state.
    debugging: true,    // Developer tooling, not an end-user action.
  }
});
```


<a id="in-page-agents-and-testing-gettools-and-executetool"></a>

## 页面内 agent 与测试（`getTools` 和 `executeTool`）

**网页无须通过 `getTools()` 或 `executeTool()` 向 AI agent 暴露工具。**只需调用 `document.modelContext.registerTool()`，浏览器 agent、浏览器扩展、DevTools 和系统级助手就能在页面代码之外发现并执行工具。

`getTools()` 和 `executeTool()` 方法专门用于运行在 JavaScript 环境内部的消费者：

1. **页面内 JavaScript agent：**直接嵌入页面（或在 `<iframe>` 内运行）的 AI 助手、copilot 组件或聊天界面，需要发现所在页面或文档树中可访问框架提供的工具，并代表用户调用它们。
2. **自动化测试与调试：**测试套件（如 Playwright、Vitest 或浏览器内单元测试）检查已注册工具的元数据，并模拟 agent 的工具调用，无须实际连接外部 LLM 测试环境。

<a id="discovering-available-tools-with-gettools"></a>

### 使用 `getTools()` 发现可用工具

页面内 agent 调用 `document.modelContext.getTools()`，从当前文档及文档树中可访问的框架获取 `RegisteredTool` 对象数组。

从 Chrome 155 开始，`RegisteredTool.inputSchema` 直接作为 JavaScript 对象返回（注册时所传 schema 的深拷贝）。修改此对象不会改变已注册工具的实际 schema。

```javascript
// Example: An in-page AI assistant discovering tools available on the page:
const tools = await document.modelContext.getTools();

// In-page agents can listen for tools being registered or unregistered dynamically:
document.modelContext.addEventListener("toolchange", async () => {
  const updatedTools = await document.modelContext.getTools();
  console.log(`Active tools updated: ${updatedTools.map((t) => t.name).join(", ")}`);
});
```


要发现跨源后代 iframe 内注册的工具（注册时必须通过 `exposedTo` 明确授予访问权限），请在选项字典中传入 `fromOrigins`：

```javascript
// Query tools registered in the embedded cart frame that exposed them to this checkout origin:
const cartTools = await document.modelContext.getTools({
  fromOrigins: ["https://cart.example.com"],
});
```


<a id="invoking-tools-with-executetool"></a>

### 使用 `executeTool()` 调用工具

页面内 agent 和测试脚本调用 `document.modelContext.executeTool(tool, inputObject, options)` 来执行已注册工具。工具在注册它的文档上运行，promise 以工具 `execute` 回调返回结果的字符串化形式兑现。

从 Chrome 155 开始，`executeTool()` 可以直接接收普通 JavaScript 对象作为 `inputObject`，与工具 `execute` 回调接收的输入格式一致。

```javascript
// 1. Discover the tool (typically done during agent initialization or test setup):
const tools = await document.modelContext.getTools();
const areaTool = tools.find((t) => t.name === "calculate_area");

if (areaTool) {
  const controller = new AbortController();
  // Example input payload matching the tool's inputSchema:
  const inputObject = { width: 10, height: 20 };
  const options = { signal: controller.signal };

  // 2. Pass input arguments as a JavaScript object, with a JSON string fallback for Chrome <155:
  let resultString;
  try {
    resultString = await document.modelContext.executeTool(areaTool, inputObject, options);
  } catch (err) {
    if (err?.message?.startsWith("Failed to parse input")) {
      resultString = await document.modelContext.executeTool(
        areaTool,
        JSON.stringify(inputObject),
        options
      );
    } else {
      // Re-throw real tool execution or cancellation errors:
      throw err;
    }
  }

  console.log("Execution output string:", resultString);
}
```


返回的 promise 会在以下情况拒绝：

* `inputObject` 不是对象，或无法序列化为 JSON 字符串（例如存在循环引用或 `BigInt` 值）。注意，JSON 序列化会省略的值（如函数和 `undefined`），会从工具接收的对象中省略，而不会导致拒绝。
* 执行通过 `options.signal` 被中止。
* 工具在执行前已注销，或遇到未处理的运行时错误。

<a id="tool-factory-pattern"></a>

## 工具工厂模式

使用工厂函数向工具传递上下文，例如 store 或应用实例。

```javascript
export function createInventoryTool(inventoryManager) {
  return {
    name: "get_inventory",
    description: "Lists items in the inventory.",
    inputSchema: { type: "object", properties: {} },
    execute() {
      return inventoryManager.getItems();
    },
    annotations: { readOnlyHint: true }
  };
}
```


<a id="typescript-types"></a>

## TypeScript 类型

在 TypeScript 项目中，**不要**手写 `document.modelContext` 的声明。安装官方 `webmcp-types` 包（`npm install --save-dev webmcp-types`），并将它添加到 `tsconfig.json`，因为它不会被自动识别：

```jsonc
{
  "compilerOptions": {
    "types": ["webmcp-types"]
  }
}
```


* `document.modelContext` 的类型是可选的，因此使用前应通过 `if (document.modelContext)` 防护。
* 对于内联 `inputSchema`，`execute` 的输入类型会从 schema 推断。
* `WebMCP.ModelContextTool` 等具名类型为全局类型（无须导入），适合用于工具工厂的类型标注。

<a id="framework-support"></a>

## 框架支持

**必须遵守：**如果应用使用 React、Angular 或 Vue，应通过下表所列的框架官方 WebMCP 集成注册工具。**不要**从组件中调用 `document.modelContext.registerTool()`，也不要自行编写生命周期包装器。每个集成都已经处理特性检测、`AbortSignal` 清理，以及按组件或 injector 生命周期限定工具作用域。这些 API 是实验性的，因此编写代码前，应在包的类型或文档中查询当前签名。

| 框架 | 包 | API | 文档 |
|---|---|---|---|
| React 18+ | `use-webmcp-tool` | `useWebMCP(options)`：每个工具调用一次 | npmjs.com/package/use-webmcp-tool |
| Angular | `@angular/core`、`@angular/forms/signals` | `provideExperimentalWebMcpTools([...])`（应用或路由 providers）、`declareExperimentalWebMcpTool(...)`（service 内）、`provideExperimentalWebMcpForms()` + Signal Forms 的 `experimentalWebMcpTool` 选项 | angular.dev/ai/webmcp |
| Vue | `@vueuse/core` | `useWebMCP(options)` composable | vueuse.org/core/usewebmcp |

使用这些集成时，本指南的所有规则仍然适用：

* 保持相同的工具定义结构：`name`、`description`、`inputSchema`、`execute(input, { signal })` 和 `annotations`。
* 遵循描述与注解的规则。
* 在 `execute` 内验证输入并应用默认值。
* 将 `signal` 传给长时间运行的工作。
* 要让工具只在部分时间可用，传入 `enabled`（React、Vue）。**不要**用条件包裹 hook 或 composable 调用。
* 集成可能会包装结果和错误（例如包装成 `{ content, isError }`）。依赖错误如何传递到 agent 之前，先检查该集成的文档。

<a id="api-notes"></a>

## API 说明

* **annotations**：（可选）工具元数据字典。
    * **readOnlyHint**：（可选）如果工具不修改任何状态，只读取数据，则设为 `true`。这帮助 agent 决定何时可以安全调用工具。
    * **consequentialHint**：（可选，Chrome 154+）对于高风险、不可逆或现实世界操作设为 `true`，以便 agent 先请求用户确认。
    * **untrustedContentHint**：（可选）工具返回网站无法控制的内容时，例如用户生成的文本或第三方 API 响应，设为 `true`。
    * **debugging**：（可选，Chrome 156+）如果工具用于调试和开发工具用途，而非最终用户任务，则设为 `true`。默认值为 `false`。
* **注册选项**：
    * **signal**：（可选）一个 `AbortSignal`，用于在不再需要时注销工具。
    * **exposedTo**：（可选）安全源字符串数组，控制文档树中哪些文档可以跨框架边界发现并执行工具。
* **工具发现选项（`ModelContextGetToolOptions`）**：
    * **fromOrigins**：（可选）要在可访问框架中查询的安全源字符串数组。不带 `fromOrigins` 调用 `getTools()` 时，只查询同源文档。
* **返回格式**：`execute` 函数可以返回任何可 JSON 序列化的值（对象、数组、字符串、数字、布尔值）。`execute` 抛出的异常消息不会转发给 agent，因此应通过返回值提供结构化错误载荷（例如 `{ error: "..." }`），让 agent 能读取并处理可采取行动的错误。
* **安全上下文**：WebMCP 要求 HTTPS。`exposedTo` 和 `fromOrigins` 中的所有源也必须潜在可信。
* **已弃用／已移除**：不再支持 `navigator.modelContext`（在 Chromium 150 中弃用）、`unregisterTool()`、`provideContext()` 和 `clearContext()`。

<a id="fallback-strategies"></a>

## 回退策略

目前尚无主流浏览器原生支持 document.modelContext。

使用 WebMCP 命令式 API 时应进行特性检测，确保兼容尚不支持 WebMCP 的浏览器。

```javascript
if ('modelContext' in document) {
  // Register tools
}
```

