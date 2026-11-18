<a id="agentic-forms"></a>

# 面向 agent 的表单

声明式 API 通过属性将标准 HTML `<form>` 元素转为 WebMCP 工具。浏览器根据表单输入生成 JSON Schema，并处理 agent 交互。

**Angular Signal Forms：****不要**给使用 `@angular/forms/signals` 的 `form()` 构建的表单添加 `toolname` / `tooldescription`。应当在应用 providers 中添加 `provideExperimentalWebMcpForms()`，并将 `experimentalWebMcpTool: { name, description }` 选项传给 `form()`。Angular 随后通过命令式 API 注册表单，根据 signal 模型构建 schema，并连接验证与提交。如果两种方式同时使用，同一个表单会被注册两次。

<a id="form-attributes"></a>

## 表单属性

* `toolname`：工具的唯一名称。
* `tooldescription`：工具的功能，以及 agent 应在何时使用它。不要列出表单字段、选项或限制：浏览器已经把这些内容包含在根据表单控件构建的 schema 中。
* `toolautosubmit`：（可选）存在该属性时，agent 可以直接提交表单，无须等待用户交互。
* `toolparamdescription`：（可选）用于在 JSON Schema 中定义属性描述。用它解释值的含义（例如提供示例值），不要重复控件的选项或限制。
    * **解析顺序**：如果存在 `toolparamdescription`，浏览器就使用它。否则使用关联 `<label>` 的 `textContent`（跳过可以关联标签的后代元素）。如果没有标签，则回退到 `aria-description`。
    * **分组（Fieldset）**：要为一组相关元素（如 `<input type="radio">` 单选按钮）添加描述，请把 `toolparamdescription` 放在最近的父级 `<fieldset>` 元素上，让描述适用于整个参数组。

<a id="example"></a>

### 示例

```html
<form toolname="search-cars" 
      tooldescription="Perform a car make/model search" 
      toolautosubmit>
  <label for="make">Vehicle Make</label>
  <input type="text" id="make" name="make" required>
  
  <label for="model">Vehicle Model</label>
  <input type="text" id="model" name="model" toolparamdescription="e.g., 330i, F-150" required>
  
  <button type="submit">Search</button>
</form>
```


<a id="handling-submissions-in-javascript"></a>

## 在 JavaScript 中处理提交

agent 提交表单时，`SubmitEvent` 包含 `agentInvoked`（布尔值）和 `respondWith(promise)`。

```javascript
document.querySelector('form').addEventListener('submit', (event) => {
  event.preventDefault();

  // Validate the form
  const formValidationErrors = myFormIsValid();

  if (formValidationErrors.length > 0) {
    if (event.agentInvoked) {
      const errorString =
        'Validation failed: ' +
        formValidationErrors
          .map((err) => `${err.field} (${err.message})`)
          .join(', ');

      event.respondWith(Promise.resolve(errorString));
    }
    return;
  }

  const resultPromise = performAsyncSearch(new FormData(event.target));

  // Return the result directly to the agent without navigation
  if (event.agentInvoked) {
    event.respondWith(resultPromise);
  }
});
```


<a id="lifecycle-events"></a>

## 生命周期事件

agent 开始或停止与工具交互时，`document.modelContext` 会发出事件：工具开始执行时触发 `toolactivated`，取消时触发 `toolcancel`。

```javascript
// Starting in Chrome 156, these events are dispatched on `document.modelContext`.
// Older versions dispatch them on `window`. Feature-detect the event handler
// property to pick the right target for backward compatibility.
const targetFor = (type, listener, options) =>
  (`on${type}` in (document.modelContext ?? {}) ? document.modelContext : window)
    .addEventListener(type, listener, options);

targetFor('toolactivated', ({ toolName }) => {
  console.log(`Tool "${toolName}" started execution.`);
});

targetFor('toolcancel', ({ toolName }) => {
  console.log(`Tool "${toolName}" execution is cancelled.`);
});
```


<a id="visual-feedback-css"></a>

## 视觉反馈（CSS）

使用伪类突出显示 agent 正在交互的表单：

* `:tool-form-active`：应用于 agent 当前使用的 `<form>` 元素。
* `:tool-submit-active`：当浏览器暂停等待用户检查时（未设置 `toolautosubmit`），应用于提交按钮。

```css
form:tool-form-active {
  outline: 2px dashed blue;
  background-color: rgba(0, 0, 255, 0.05);
}

button:tool-submit-active {
  outline: 2px dashed red;
  animation: pulse 2s infinite;
}
```


<a id="form-suitability-when-to-avoid"></a>

## 表单适用性（何时避免使用）

声明式 API 最适合自包含的标准表单。在以下场景中不太合适：

* **字段依赖很强**：输入项的选项或可见性会随着其他输入而变化的表单。自动生成的 schema 难以准确表达这些依赖。
* **自定义 UI 组件**：依赖非标准输入（例如 canvas、富文本编辑器），且不会自动序列化值的表单。
* **多步骤向导**：需要多次表单提交的复杂工作流。命令式 API 或标准 DOM 交互更适合这种情况。

<a id="when-to-use-toolautosubmit"></a>

## 何时使用 toolautosubmit

* **只读操作与查询**：搜索、筛选、获取详情或查询状态（例如搜索车型、搜索目录、查询库存）。
* **低风险、可撤销的操作**：用户可以轻松手动撤销或调整的表单操作（例如添加商品到购物车、应用优惠码、保存草稿或设置临时布局选项）。

<a id="when-to-omit-toolautosubmit"></a>

## 何时省略 toolautosubmit

* **破坏性或不可逆操作**：删除记录、重置系统配置或清空数据库。
* **金融与交易操作**：提交结账表单、转账、授权订阅付款或最终下单。
* **对外沟通中影响重大的操作**：最终提交职位申请、给其他真实用户发送电子邮件或消息，或发布面向公众的内容。
* **敏感账户设置**：更改密码、修改用户角色或权限，或更新账单与个人资料信息。

<a id="fallback-strategies"></a>

## 回退策略

目前尚无主流浏览器原生支持与表单关联的 WebMCP 属性。

WebMCP 声明式 API 可以安全地用于所有浏览器。不支持 WebMCP 的浏览器会忽略 `tool*` 属性，`<form>` 继续作为普通 HTML 表单工作，无须特性检测。
