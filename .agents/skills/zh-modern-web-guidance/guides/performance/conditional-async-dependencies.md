<a id="conditional-async-dependencies"></a>

# 按条件加载异步依赖

顶层 `await` 让模块可以像异步函数一样工作，也就是暂停模块执行，等待 Promise 完成。这非常适合按条件加载异步依赖，例如 polyfill 或体积较大的辅助库，仅在浏览器需要时加载。

利用顶层 await，可以将条件加载逻辑封装在单个模块中，在依赖完整加载并准备就绪之前，阻止下游使用该依赖的模块执行。

<a id="conditional-polyfill-pattern"></a>

### 按条件加载 polyfill 的模式

虽然顶层 `await` 可以按条件加载任何模块形式的异步依赖，但这种模式特别适合为不支持某项特性的浏览器加载 polyfill。该方式将特性检测和动态导入封装在一个依赖模块内部。

以下示例在 `HTMLElement.prototype` 上不存在 `popover` 时，按条件加载该属性的 polyfill：

```javascript
// conditionally-load-polyfill.js

// Check if the feature is missing before doing work.
// MANDATORY: Prefer checking HTMLElement.prototype over window or document
// when checking for a global DOM attribute or property like popover.
if (!('popover' in HTMLElement.prototype)) {
  // Use top-level await to pause the execution of any module that imports this file 
  // until the polyfill finishes downloading and executing.
  await import('/path/to/popover-polyfill.js');
}

// Export a marker if needed by your application
export const polyfillLoaded = true;
```

```javascript
// main.js

// MANDATORY: Because conditionally-load-polyfill.js uses top-level await, 
// this import will block execution of main.js until the polyfill is ready.
import './conditionally-load-polyfill.js';

// Now it is safe to use the feature (e.g., showing a popover)
const myPopover = document.getElementById('my-popover');
if (myPopover) {
  myPopover.showPopover();
}
```

<a id="sequencing-module-imports-and-avoiding-the-pre-safari-27-bug"></a>

### 安排模块导入顺序并避开 Safari 27 之前的缺陷

**必须**：模块依赖图应当确保包含顶层 `await` 的模块仅由单个入口导入，并且在下游模块开始求值前完成：

* **不要在入口文件中放置并列的静态导入**，例如 `import './conditionally-load-polyfill.js'; import './app.js';`。按照 ECMAScript 模块求值规范，顶层 `await` 只会暂停导入它的父模块，不会暂停并列的静态导入。因此，在所有浏览器中，`./app.js` 都会并发求值，在 polyfill 完成加载前开始执行。
* **不要让多个并列模块同时导入包含顶层 `await` 的模块**，例如 `a.js` 和 `b.js` 都静态导入 `./conditionally-load-polyfill.js`。虽然 [Safari 27 修复了 WebKit 的模块加载器](https://webkit.org/blog/18227/fixing-top-level-await-in-safari/)，使其按规范支持并发导入顶层 `await` 模块，但 Safari 15–26.6 在多个模块同时导入包含顶层 `await` 的模块时会失败，参见 [MDN 浏览器兼容性](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await#browser_compatibility)。

根据模块结构，选择以下两种模式之一：

1. **单一入口模块（如上面的 `main.js`）**：如果入口模块直接执行依赖初始化逻辑，在模块顶部静态导入 `./conditionally-load-polyfill.js`，然后在模块主体中执行代码。
2. **启动独立应用模块**：如果入口模块将工作交给下游应用模块，例如 `./app.js`，通过顶层 `await` 串联动态 `import()` 调用，使 `./app.js` 仅在 polyfill 模块完成后才获取并求值：

```javascript
// main.js

// MANDATORY: Chain dynamic imports with top-level await when bootstrapping separate
// application modules so './app.js' waits for the polyfill to finish loading.
// DO NOT use sibling static imports (`import './conditionally-load-polyfill.js'; import './app.js';`),
// which evaluate concurrently and execute './app.js' before the polyfill is ready.
await import('./conditionally-load-polyfill.js');
await import('./app.js');
```

<a id="fallback-strategies"></a>

### 回退策略

Top-level await 的 Baseline 状态：Newly available。自 2026-09-14 起纳入 Baseline。
支持的浏览器：Chrome 89（2021 年 3 月）、Edge 89（2021 年 3 月）、Firefox 89（2021 年 6 月）和 Safari 27（2026 年 9 月）。

虽然主流浏览器从 2021 年起就已支持基本的顶层 `await`，包括 Chrome 89、Edge 89、Firefox 89 和 Safari 15，但直到 [Safari 27](https://webkit.org/blog/18227/fixing-top-level-await-in-safari/) 才完全符合规范，参见 [MDN 浏览器兼容性](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await#browser_compatibility)。

* **Safari 15–26.6**：只要遵循上一节的单入口模式，避免多个并列模块并发导入顶层 `await` 模块，就可以放心使用顶层 `await`，无需额外回退。
* **旧版浏览器（2021 年以前）**：如果应用必须支持完全不具备顶层 `await` 能力的浏览器，应避免使用顶层 `await`，将有条件的 `import()` 编排封装在普通 `async` 函数或 `.then()` Promise 链中。
