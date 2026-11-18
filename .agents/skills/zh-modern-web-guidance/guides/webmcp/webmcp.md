<a id="webmcp"></a>

# WebMCP

WebMCP 是浏览器原生的 JavaScript API，让网页能够把客户端功能作为结构化“工具”提供给 AI agent、浏览器助手和辅助技术。

重要：WebMCP 目前处于基于 Chromium 的浏览器（如 Chrome 和 Edge）的早期预览阶段。它要求 Chromium 版本不低于 `146.0.7672.0`，并启用 `#enable-webmcp-testing` 标志。

**关键区别：**WebMCP 完全运行于浏览器标签页的**客户端**。它不是后端服务器，也不使用 HTTP、Server-Sent Events（SSE）或 `stdio` 传输。网页本身就是工具注册表。

目前 WebMCP **仅支持 Tools**，不支持后端 Model Context Protocol 中的“Resources”或“Prompts”原语。

<a id="quick-overview"></a>

## 快速概览

- **命令式 API**：对于复杂逻辑和动态交互，使用 `document.modelContext.registerTool()`。
- **声明式 API**：给标准 HTML `<form>` 元素添加 `toolname` 和 `tooldescription` 属性，将其转为工具。
- **框架（必须遵守）**：React 使用 `use-webmcp-tool` 的 `useWebMCP`。Angular 使用 `@angular/core` 的 `provideExperimentalWebMcpTools` / `declareExperimentalWebMcpTool`。Vue 使用 `@vueuse/core` 的 `useWebMCP`。**不要**在组件中直接调用 `registerTool()`。

<a id="best-practices"></a>

## 最佳实践

* **命名与语义**：用具体动词描述准确行为（例如 `create-event`，而不是 `start-event-creation-process`）。优先正面说明功能，而不是罗列限制。
* **描述**：说明工具做什么、何时使用。不要重复参数名称、类型、枚举值、默认值或限制：agent 已经会从输入 schema（你的 `inputSchema`，或浏览器根据表单控件构建的 schema）中得到这些信息。将这些细节写入 schema；若某个值的含义不明显，在该参数自身的描述里解释。
* **Schema 设计**：接受用户的原始输入（避免让 agent 做数学运算或计算）。保证所有参数都有具体类型，并说明各选项的用途。
* **可靠性**：在代码中验证约束，并返回具有描述性的错误以支持重试。妥善处理限流。确保函数在 UI 状态更新之后才返回，以保持一致。
* **工具策略**：工具应当原子化、可组合且职责分明。不要强加流程控制指令（“调用 A 后不要调用 B”），让 agent 自行决定。根据当前页面上下文动态注册或注销工具。对于不修改状态的工具，使用 `annotations: { readOnlyHint: true }`（放在 `execute` 之后），告知 agent 可以安全执行。
* **清理**：页面切换或资源释放时，始终通过 `AbortSignal` 注销工具，避免泄漏和冲突。不要使用 `unregisterTool`。
* **Web 开发最佳实践**：WebMCP 工具以客户端 JavaScript 的形式运行在浏览器标签页中，必须遵守通常的 Web 开发最佳实践（例如不把密钥放入客户端代码，通过安全的 API 层访问后端数据库，以及用 Web Workers、WASM 或 WebGPU 执行重计算）。

<a id="when-to-discourage-webmcp"></a>

### 何时不建议使用 WebMCP

* **缺少保护措施的高风险操作**：对于破坏性或不可逆操作（例如删除数据），避免使用自动提交工具，除非 UI 要求用户在 agent 控制范围之外手动确认。
* **高度动态的状态**：如果数据的变化速度超过 agent 的反应速度，agent 可能依据过期上下文操作。

<a id="anti-patterns--warnings-do-not-do-this"></a>

### 反模式与警告（不要这样做）

* **不要使用后端传输。**WebMCP 面向浏览器标签页，而非 Node.js 后台进程。
* **不要包含 Resources 或 Prompts。**当前 WebMCP 规范不支持它们。
* **不要忽视 `inputSchema` 的结构。**始终为每个参数提供清晰的描述，尽量减少 agent 幻觉。
* **不要在安全上下文（HTTPS）之外使用。**

<a id="implementation-status"></a>

## 实现状态

WebMCP 目前处于基于 Chromium 的浏览器（例如 Chrome、Edge）的早期预览阶段：

* **当前状态**：早期预览。
* **所需版本**：Chromium `146.0.7672.0` 或更高。
* **启用方式**：需要启用 `chrome://flags/#enable-webmcp-testing` 或 `edge://flags/#enable-webmcp-testing` 标志。
* **规范**：仍在演进的[社区组规范草案](https://webmachinelearning.github.io/webmcp/)，尚不是标准轨道上的推荐规范。
