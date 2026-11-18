<a id="language-model"></a>

# 语言模型

Prompt API 让开发者使用 **Gemini Nano**，直接在浏览器中执行自然语言处理任务。这种内置 AI 方式能够保障用户隐私、降低服务器成本，并支持离线功能。

<a id="1-getting-started-and-hardware-requirements"></a>

## 1. 开始使用与硬件要求

Prompt API 从 Chrome 148（桌面版）起可用，适用于 Windows、macOS、Linux 和 Chromebook Plus。

<a id="hardware-prerequisites"></a>

### 硬件前置条件

- **存储**：22 GB 可用空间（用于初始配置文件和模型）。
- **内存／CPU**：16 GB RAM 和至少 4 个 CPU 核心。
- **GPU**：至少 4 GB 显存（音频输入必需）。
- **网络**：仅初次下载模型时需要。

<a id="initializing-the-api"></a>

### 初始化 API

**用户手势要求：**当 `availability()` 返回 `'downloadable'` 或 `'downloading'` 时，`LanguageModel.create()` 会启动下载，因此需要用户手势，例如点击按钮。应在事件监听器中调用，而不是在页面加载时调用，否则会以 `NotAllowedError` 拒绝。

触发下载之前，检查模型可用性：

```javascript
const availability = await LanguageModel.availability();

function createSession() {
	return LanguageModel.create({
		monitor(m) {
			// Inform the user while the model downloads so the UI doesn't appear frozen.
			m.addEventListener('downloadprogress', (e) => {
				console.log(`Downloaded ${e.loaded * 100}%`);
				progressEl.value = e.loaded; // a <progress max="1"> with an accessible name
			});
		},
	});
}

// Do not call create() when unavailable — the model cannot run on this device.
if (availability === 'available') {
	const session = await createSession();
} else if (availability !== 'unavailable') {
	// Starting the download requires a user gesture.
	downloadButton.addEventListener('click', async () => {
		const session = await createSession();
		downloadStatusEl.textContent = 'Model downloaded'; // a polite live region
	});
}
```


用具有无障碍名称的 `<progress>` 元素显示下载进度，不要只打印到控制台；下载完成时，通过礼貌播报的 live region 宣告（WCAG 4.1.3 状态消息）。如果启动下载的按钮在拥有焦点时被隐藏，将焦点移到下载状态文本上（给该文本设置 `tabindex="-1"`）（WCAG 2.4.3 焦点顺序）。

<a id="2-core-prompting-capabilities"></a>

## 2. 核心提示能力

本节会话示例为简洁省略了 `session.destroy()`。会话不再需要时，始终调用 `session.destroy()` 释放设备内存（见第 5 节）。

<a id="basic-and-streamed-output"></a>

### 基本输出与流式输出

短响应使用 `prompt()`；较长内容使用 `promptStreaming()`，让 UI 响应更及时。

**必须遵守：**绝不将模型输出赋给 `innerHTML`。模型输出不可信，可能包含注入的标记。始终使用 `textContent` 或清理器。

```javascript
const session = await LanguageModel.create();

// prompt() accumulates the full response before resolving — use for short, one-shot output.
const result = await session.prompt('Write a haiku about coding.');
// textContent, not innerHTML — model output is untrusted and must not be parsed as markup.
outputEl.textContent = result;

// promptStreaming() yields independent chunks that must be concatenated;
// use for longer content so each chunk can be rendered progressively.
const stream = session.promptStreaming('Write a long story about a robot.');
let completeResult = '';
outputEl.setAttribute('aria-busy', 'true'); // outputEl: <div aria-live="polite">
try {
	for await (const chunk of stream) {
		completeResult += chunk;
		outputEl.append(chunk);
	}
} finally {
	outputEl.setAttribute('aria-busy', 'false');
}
console.log('Full story:', completeResult);
```


让接收输出的元素成为礼貌播报的 live region，并从页面加载时就存在；响应流入期间在该元素上设置 `aria-busy="true"`，使辅助技术播报完整响应，而不是逐块播报（WCAG 4.1.3 状态消息）。流入过程中不要移动焦点。

**必须遵守：**如果输出语言与页面语言不同，应在输出元素上设置 `lang`，使用 `expectedOutputs` 声明的语言，使屏幕阅读器正确发音（WCAG 3.1.2 局部语言）。

<a id="multimodal-input"></a>

### 多模态输入

Prompt API 支持文本、音频和视觉输入（图像、canvas、视频帧）。

```javascript
const session = await LanguageModel.create({
	// Declaring expected input types lets the browser optimize model loading.
	expectedInputs: [{ type: 'text' }, { type: 'image' }],
	expectedOutputs: [{ type: 'text' }],
});

const response = await session.prompt([
	{
		role: 'user',
		content: [
			{ type: 'text', value: 'What is in this image?' },
			{ type: 'image', value: document.querySelector('canvas') },
		],
	},
]);
```


<a id="3-advanced-session-management"></a>

## 3. 高级会话管理

会话让模型能够在多次交互之间保持上下文。

<a id="context-and-quota"></a>

### 上下文与配额

每个会话都有 token 数量上限。可以通过 `session.contextUsage` 和 `session.contextWindow` 监测使用情况。窗口溢出时，最早的消息（系统提示除外）会被丢弃。

<a id="cloning-sessions"></a>

### 克隆会话

当需要启动共享相同初始上下文（如“system”角色设定）的并行对话时，克隆很高效，无须重新初始化。

```javascript
const mainSession = await LanguageModel.create({
	initialPrompts: [{ role: 'system', content: 'You speak like a pirate.' }],
});

const branchA = await mainSession.clone();
const branchB = await mainSession.clone();

// Run independent tasks on each clone, then destroy the clones when done.
await branchA.prompt('Greet the crew.');
branchA.destroy();

await branchB.prompt('Chart a course.');
branchB.destroy();

// Keep mainSession if you plan to clone it again later, or destroy it once no more clones are needed.
mainSession.destroy();
```


<a id="restoring-past-sessions"></a>

### 恢复过去的会话

原生“恢复”功能仍在开发中，目前可以将先前历史传入 `initialPrompts` 来重建会话。

**注意**：`localStorage` 不加密且持久保存。保存的对话历史可能包含用户个人身份信息；持久化聊天历史之前，应考虑隐私影响。

```javascript
// || '[]' ensures JSON.parse never receives null when the key doesn't exist yet.
const history = JSON.parse(localStorage.getItem('chat_history') || '[]');
const session = await LanguageModel.create({
	initialPrompts: history, // Array of {role, content} objects
});
```


<a id="4-structured-output-with-json-schema"></a>

## 4. 通过 JSON Schema 生成结构化输出

为防止模型加入“闲话”（例如“当然，以下是你的 JSON：”），通过 `responseConstraint` 字段使用 **JSON Schema**。这能确保输出是有效 JSON，可以立即解析。

<a id="example-sentiment-classification"></a>

### 示例：情感分类

```javascript
// Pass the schema as a plain object — do not JSON.stringify() it first.
const schema = {
	type: 'object',
	properties: {
		rating: { type: 'number', minimum: 1, maximum: 5 },
		is_positive: { type: 'boolean' },
	},
	required: ['rating', 'is_positive'],
};

const result = await session.prompt(
	"Rate the following feedback: 'The food was great!'",
	{ responseConstraint: schema },
);

const data = JSON.parse(result);
console.log(data.rating); // 5
```


<a id="constraints-and-prefixes"></a>

### 约束与前缀

使用 `prefix: true` 预填助手响应，可以进一步引导模型。

````javascript
const character = await session.prompt([
	{ role: 'user', content: 'Create a character sheet' },
	{ role: 'assistant', content: '```json\n', prefix: true },
]);
````


<a id="5-best-practices-and-safety"></a>

## 5. 最佳实践与安全

- **资源清理**：对话结束时始终调用 `session.destroy()` 释放内存。
- **输出安全**：模型输出不可信。始终将结果写入 `textContent`，不要写入 `innerHTML`，防止恶意模型输出造成 XSS 注入。
- 如果需要允许有限 HTML，使用原生 Sanitizer API 或 DOMPurify 等清理器。
- **中止任务**：使用 `AbortController` 让用户停止长时间生成。将 `signal` 传给 `prompt()` 或 `promptStreaming()`，而不是 `LanguageModel.create()`。如果停止按钮在拥有焦点时被隐藏，将焦点移回启动生成的控件（WCAG 2.4.3 焦点顺序）。
- **错误处理**：`create()`、`prompt()`、`promptStreaming()` 和 `JSON.parse()` 都可能失败，因此应将它们以及读取流的循环放入 `try` / `catch`，并在输出的 live region 中用通俗语言显示错误（WCAG 3.3.1 错误识别）。用户停止产生的 `AbortError` 应视为预期行为，而非错误。
- **安全**：使用 Permission Policy 控制 iframe 访问：`<iframe src="..." allow="language-model"></iframe>`。
- **设计**：阅读 [People + AI Guidebook](https://pair.withgoogle.com/guidebook/)，确保以负责任的方式实现 AI。

将结构化输出与稳健的会话管理结合，开发者就能构建完全运行在用户设备上的复杂、有状态 AI 应用。

<a id="dos-and-donts"></a>

### 应做与不应做

完整、详细的建议列表参见 https://developer.chrome.com/docs/ai/built-in-ai-dos-donts.md.txt 。以下为要点：

<a id="prepare-the-model-at-a-reasonable-time"></a>

#### 在合理时机准备模型

*适用于：所有 API，例如 Summarizer、Translator 和 Writer。*

**应当：**一旦明确用户有意使用 AI 功能，就初始化会话，例如用户进入相关 AI 工具界面、悬停在 AI 工作区，或与该功能周围 UI 交互时。预热会话可以在用户设置任务的同时，在后台安静地把模型加载到内存，消除可避免的冷启动延迟。
尝试提前一步，在开始渲染当前结果时就启动最可能的下一个 AI 任务，例如当功能设计为反复迭代使用时。

**不要：**除非有必要，不要等到用户点击“生成”才初始化会话。这会产生冷启动延迟，因为模型必须先加载到内存，再准备执行流水线。

> [!CAUTION]
> 对 Prompt API，要等 `initialPrompts` 准备好再调用 `create()`，因为它们只能在创建会话时设置。

<a id="set-initial-prompts-during-creation"></a>

#### 创建时设置初始提示

*适用于：Prompt API。*

**应当：**在会话初始化期间提供系统指令，提高首次提示的速度。

**不要：**先创建空会话，再把系统指令作为第一次 `prompt()` 调用的一部分发送。这会迫使模型在最后时刻处理这些指令，增加延迟。

<a id="clone-sessions-for-repetitive-tasks"></a>

#### 为重复任务克隆会话

*适用于：Prompt API。*

对于 Prompt API，每个会话都会[跟踪对话上下文](https://developer.chrome.com/docs/ai/prompt-api?content_ref=each+session+keeps+track+of+the+context+of+the+conversation+previous+interactions+are+taken+into+account+for+future+interactions+until+the+session+s+context+window+is+full)，将所有先前交互考虑在内。克隆会继承父会话的全部内容，包括初始提示以及克隆时点之前的所有交互历史，因此应安排使用方式，只继承所需内容。

**应当：**

- 创建基础会话：为高效处理彼此无关的任务，创建只包含系统指令、不含先前对话上下文的基础会话。
- 克隆基础会话：对新任务调用基础会话的 `clone()`，省去重新解析系统指令的开销。这样可以创建并行对话，或将任务重置到初始基线。

**不要：**

- 不要为无关任务复用同一会话，也不要克隆已经包含不必要交互历史的会话。这两种方式都会让无关的先前上下文干扰当前任务。
- 不要带着相同系统指令反复调用 `create()`；改用克隆模式优化性能。

<a id="destroy-unused-sessions"></a>

#### 销毁不再使用的会话

*适用于：所有 API。*

**应当：**对不再需要的会话显式调用 [`destroy()`](https://developer.chrome.com/docs/ai/prompt-api#terminate_a_session)，在功能停止使用时释放内存。如果使用克隆模式，在仍需创建新克隆期间保留基础会话；每个克隆会话任务结束后立即销毁；不再需要更多克隆时，再销毁基础会话。

**不要：**让多个大型会话持续活跃。每个会话都会消耗内存，产生不必要的资源使用，可能形成问题。会话会自然地被垃圾回收器清理，但调用 `destroy()` 能更快释放内存。

<a id="render-streaming-responses-safely-and-efficiently"></a>

#### 安全、高效地渲染流式响应

*适用于：所有支持流式输出的 API（Prompt、Summarizer、Writer、Rewriter 和 Translator）。*

**应当：**将所有 LLM 输出视为不可信内容。清理完整的合并输出，而不是只清理单个分块，因为恶意代码可能分散在多次更新中。支持的环境中，渲染前使用 [Sanitizer API](https://developer.mozilla.org/docs/Web/API/HTML_Sanitizer_API)。为避免性能下降，使用 [streaming-markdown](https://github.com/thetarnav/streaming-markdown) 等流式 Markdown 解析器。

**不要：**每次分块更新都直接设置 `innerHTML`。这种方式很慢，特别是在语法高亮等复杂格式下，而且容易发生注入。

<a id="optimize-input-for-speed"></a>

#### 优化输入以提高速度

*适用于：所有 API。*

**应当：**只向模型传递严格必需的内容。移除与当前任务无关的一切。大型数据集应提供简短概览和少量相关项目。

**不要：**向 API 发送未经处理的原始文本、不必要的元数据、HTML 标签或大型未筛选列表。延迟会随输入量显著增长，让 AI 功能在很多设备上看起来像是失效。

<a id="use-structured-output-for-predictable-results"></a>

#### 使用结构化输出获得可预测结果

*适用于：Prompt API。*

**应当：**需要模型以特定格式返回数据时，通过 `responseConstraint` 字段提供 JSON Schema，使用[结构化输出](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api?content_ref=he+prompt+api+lets+you+specify+a+json+output+format+of+the+model+s+response+by+passing+a+json+schema+to+the+languagemodel+prompt+and+languagemodel+promptstreaming+methods)。这样能使输出可预测，避免复杂后处理或手动解析。

**不要：**只依赖自然语言指令（如“只输出 JSON”）。模型可能加入对话式填充内容，导致解析器失败。

<a id="decouple-generation-from-length-constraints"></a>

#### 将生成与长度约束解耦

*适用于：Prompt API，因为它是唯一支持[结构化输出 schema](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api) 的 API。*

**应当：**让模型自然生成响应，再用客户端逻辑截断文本以适配 UI。

**不要：**用[结构化输出 schema](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api) 强制严格字符限制，如 `maxLength: 125`。当模型响应长于所设限制时，模型可能切换到其他语言或 emoji 等信息密度较高的 token，以压缩含义，结果生成不知所云的输出。

<a id="keep-the-user-informed"></a>

#### 让用户了解进展

*适用于：所有 API。*

**应当：**依据任务复杂度和预期时长，使用动画、视觉提示和进度指示，让用户了解进展。最佳做法取决于用例和 API 输出预期长度。可参考：

- 长内容采用流式输出：对摘要或聊天，流式输出默认形成逐 token 的打字机效果，感受自然，也能立即提供反馈。
- 短任务（或长时间异步任务）采用非流式输出：短输出（如 alt 文本）使用非流式方式，可以让 UI 更精致；也能在当前结果渲染期间，预先准备下一个可能的 AI 任务。这种做法也适用于较长的异步或后台任务。如果用户继续操作并不依赖输出，就不必急于实时显示结果，但应在 UI 中表明处理仍在进行。
- 更新采用视觉过渡：翻译或改写文本时，使用词语变形等动画。关于尊重减少动态效果偏好，参见 `motion`（通过 `npx -y modern-web-guidance@latest retrieve "motion"` 获取）。

**不要：**在没有视觉提示、或没有向辅助技术用户播报的情况下更新 UI。

<a id="align-with-the-users-mental-model-of-time-and-work"></a>

#### 符合用户对时间和工作量的认知

*适用于：所有 API。*

**应当：**如果响应几乎即时完成，可考虑人为延迟一两秒。看似矛盾，但当用户感知到的生成过程与其认为的任务难度一致时，结果可能显得更可信。用动画表明发生了 AI 处理。

**不要：**用瞬间替换的 UI 让用户措手不及。

<a id="allow-users-to-quickly-navigate-and-undo-ai-edits"></a>

#### 让用户快速浏览和撤销 AI 编辑

*适用于：所有 API。*

**应当：**为 UI 配备步骤导航或历史记录，让用户放心探索不同结果，并快速撤销 AI 编辑，保证不同版本仍可随时访问。

**不要：**覆盖用户先前草稿，或用户可能喜欢的 AI 结果，却不提供返回、撤销或比较版本的方式。

<a id="empower-user-control-and-overrides"></a>

#### 赋予用户控制与覆盖能力

*适用于：所有 API。*

**应当：**让用户成为所有生成内容的最终编辑者。提供直观的覆盖方式，使用户完整掌握最终输出。API 可能产生错误结果。

**不要：**把 AI 生成结果强加为唯一选项。

<a id="cache-results-for-repeated-tasks"></a>

#### 缓存重复任务的结果

*适用于：所有 API。*

**应当：**为重复输入或查询实现本地结果缓存（例如使用 `sessionStorage` 或 `IndexedDB`）。通过去除首尾空白和转为小写来规范化输入，提高命中率。对于图像等大型输入，生成哈希作为缓存键。给缓存设置保守的生存时间（TTL），或在返回缓存结果的同时后台更新。如果结果不满意，让用户能触发一次新推理。

**不要：**在不希望结果变化的场景中，对重复搜索查询或相同数据输入重新执行相同推理，例如用户在搜索结果之间反复前后导航时。
这样能优化响应速度，并高效利用本地计算资源。

<a id="6-fallback-strategies"></a>

## 6. 回退策略

LanguageModel 的浏览器支持状态：有限可用。
支持的浏览器：Chrome 148（2026 年 5 月）。
不支持：Edge、Firefox 和 Safari。

使用前，检查全局作用域中是否存在 LanguageModel 对象：

```js
if ('LanguageModel' in self) {
  // The Prompt API is supported.
} else {
  // Execute fallback strategy
}
```


如果不支持 Prompt API，或可用性检查返回 'unavailable'，必须平稳回退：

* 远程 API 回退：将检测请求转发到服务器端点或云 API（如 Vertex AI Gemini API）。
* 本地 API 回退：将检测请求转发到本地端点，例如使用 Transformers.js。
