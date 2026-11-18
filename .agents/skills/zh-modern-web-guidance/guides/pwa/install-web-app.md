<a id="installing-web-applications"></a>

# 安装 Web 应用

使用 Web Install API，为用户提供明确的页内 Web 应用安装入口。安装始终通过浏览器控制的同意界面完成；网站无法静默安装应用。

可以使用 HTML `<install>` 元素，也可以使用 JavaScript `navigator.install()` 方法。

<a id="choose-which-install-approach-to-use-html-element-or-javascript-method"></a>

## 选择安装方式：HTML 元素或 JavaScript 方法

根据以下因素，在 HTML `<install>` 元素和 JavaScript `navigator.install()` 方法之间选择。

* `<install>` 元素：
  * 优点：
    * 由浏览器提供安装控件，确保一致且可信的安装体验。
    * 安装另一个应用时，不会在安装确认对话框之前再触发独立权限提示。
    * 触发安装不需要 JavaScript。
  * 缺点：
    * 按钮的视觉定制受到限制。
    * 页面上的 `<install>` 元素数量受到用户代理反垃圾规则的限制，因此大型应用目录更适合 `navigator.install()`。

* JavaScript `navigator.install()` 方法：
  * 优点：
    * 可以充分定制安装 UI，使其符合网站外观和风格。
    * 安装 UI 元素的数量不受浏览器限制。
  * 缺点：
    * 需要 JavaScript 才能触发安装。
    * 安装另一个应用时，会先触发 `web-app-installation` 权限提示，再出现安装确认对话框。

<a id="prepare-the-web-app"></a>

## 准备 Web 应用

被安装的应用必须有 Web 应用 manifest。为 manifest 提供稳定的 `id`，使浏览器能够将应用身份与启动 URL 分开。安装当前应用时，在文档中链接 manifest。

```html
<!-- The current document's manifest is used by the no-argument install APIs. -->
<link rel="manifest" href="/manifest.webmanifest">
```

```json
{
  "id": "/",
  "name": "Example application",
  "short_name": "Example",
  "start_url": "/",
  "display": "standalone",
  "icons": [
    {
      "src": "/icons/app-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/app-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

保持 manifest URL 稳定。安装当前文档对应应用时，manifest 必须显式声明一个与文档同源的 `id`。通过 manifest URL 提供另一个应用时，该 manifest 必须能通过 HTTPS 访问，不需要凭据、不发生重定向，不要求 CORS 响应头；响应必须返回 JSON MIME `Content-Type`，例如 `application/manifest+json`，并且与该应用的 `start_url` 同源。

<a id="use-the-html-install-element"></a>

## 使用 HTML `<install>` 元素

`<install>` 元素会渲染由用户代理控制的按钮。如果浏览器的标准标签和展示方式适用，优先采用它，因为浏览器拥有的控件能向用户提供可信的安装入口。

```html
<!-- No attributes installs the current document's linked web app. -->
<install></install>
```

要提供另一个 Web 应用，包括应用目录或套件启动器中的跨源应用，传入其 manifest URL。目标 `manifest` URL 必须与其 `start_url` 同源，并且 manifest 必须无需凭据或重定向即可访问，返回 JSON MIME `Content-Type`：

```html
<install manifest="https://app.example/manifest.webmanifest"></install>
```

优先在目标 manifest 中声明明确且稳定的 `id`。如果目标 manifest 没有声明 `id`，必须在 `manifestid` 属性中提供计算后的 manifest ID，让浏览器核验预期应用身份：

```html
<install
  manifest="https://app.example/manifest.webmanifest"
  manifestid="https://app.example/"
></install>
```

manifest 省略 `id` 时，浏览器会相对于 manifest URL，而不是安装页面，解析 `start_url`，去掉 URL 片段但保留查询参数，得到回退 ID。例如，位于 `https://app.example/catalog/manifest.webmanifest` 的 manifest 没有 `id`，并包含 `"start_url": "../launch?source=catalog"`，其计算 ID 就是 `https://app.example/launch?source=catalog`。提供 `manifestid` 是为了检查这一计算身份；它不会覆盖 manifest，也无法在 `start_url` 之后变化时保持身份稳定。

`manifestid` 属性可以使用绝对值或相对值。相对值以安装文档的基础 URL 为基准解析，最终 URL 必须与目标 manifest 处理后的 ID 一致。

不要仿制、覆盖或变换浏览器控制的元素。其展示和激活限制用于保护用户，防止欺骗性安装提示。

<a id="handle-installation-success-and-errors"></a>

### 处理安装成功与错误

监听 `installresult` 事件处理安装成功和错误，通过 `event.result` 判断结果：

* `"success"`：应用已安装，或者用户批准了对已安装应用执行某个操作，例如打开。页面无法区分这两种情况。
* `"aborted"`：用户取消安装，或浏览器条件阻止安装完成。
* `"invalid-data"`：`manifest` 或 `manifestid` 属性值、manifest 响应或必需 manifest 字段无效。

```html
<install></install>
<p id="install-status" role="status"></p>

<script type="module">
  const installButton = document.querySelector("install");
  const installStatus = document.querySelector("#install-status");

  installButton.addEventListener("installresult", (event) => {
    switch (event.result) {
      case "success":
        installStatus.textContent = "The app was installed or opened.";
        break;
      case "aborted":
        installStatus.textContent =
          "Installation was canceled or could not complete.";
        break;
      case "invalid-data":
        installStatus.textContent =
          "Installation could not start because the app data is invalid.";
        break;
    }
  });
</script>
```

<a id="use-the-javascript-navigatorinstall-method"></a>

## 使用 JavaScript `navigator.install()` 方法

需要自定义页面 UI 时，在安全上下文（HTTPS）中使用 `navigator.install()`。在受支持的安装机制可用之前，让按钮保持隐藏。直接从点击处理器中调用 `navigator.install()`，保留所需的瞬时用户激活状态。

```html
<button id="install-app" type="button" hidden>Install app</button>
<p id="install-status" role="status"></p>

<script type="module">
  const installButton = document.querySelector("#install-app");
  const installStatus = document.querySelector("#install-status");
  const supportsWebInstall =
    typeof Navigator.prototype.install === "function";

  if (supportsWebInstall) {
    installButton.hidden = false;
  }

  installButton.addEventListener("click", async () => {
    if (installButton.getAttribute("aria-disabled") === "true") {
      return;
    }
    // Use aria-disabled instead of disabled so activating the button does not drop focus.
    installButton.setAttribute("aria-disabled", "true");

    try {
      // MANDATORY: Call during the click handler; delayed calls lose user activation.
      await navigator.install();
      installStatus.textContent = "The app was installed or opened.";
      installButton.hidden = true;
    } catch (error) {
      if (error.name === "AbortError") {
        // Cancellation is an expected user choice; keep the button available to retry.
        installStatus.textContent = "Installation was canceled or could not complete.";
      } else {
        installStatus.textContent = "Installation could not start.";
        // Surface invalid manifests and unexpected platform failures to developers.
        console.error(error);
      }
    } finally {
      installButton.removeAttribute("aria-disabled");
    }
  });
</script>
```

不传参数调用 `navigator.install()`，会安装当前文档链接的应用，并要求 manifest 声明 `id`。

要提供另一个应用，包括跨源应用，传入其 manifest URL；前提是目标 `manifest` URL 与 `start_url` 同源，并且 manifest 通过 HTTPS 提供，返回 JSON MIME `Content-Type`：

```js
await navigator.install({
  manifest: "https://app.example/manifest.webmanifest",
});
```

优先在目标 manifest 中声明明确、稳定的 `id`。如果该 manifest 没有声明 `id`，还应传入目标 Web 应用计算后的 manifest ID，即相对于 manifest URL 解析 `start_url` 并去掉片段，让浏览器核验预期身份：

```js
await navigator.install({
  manifest: "https://app.example/manifest.webmanifest",
  manifestId: "https://app.example/",
});
```

`manifestId` 选项可以是绝对或相对值。相对值以安装文档的基础 URL 为基准解析，最终 URL 必须与目标 manifest 处理后的 ID 一致。

<a id="handle-installation-success-and-errors-1"></a>

### 处理安装成功与错误

`navigator.install()` 返回一个 Promise；安装完成时，或者用户批准对已安装应用执行某项操作，例如打开时，该 Promise 兑现。页面无法区分这两种情况。

如果安装失败或取消，Promise 会以下列错误拒绝：

* `AbortError`：
  * 用户中止安装。
  * 权限被拒绝。
  * 环境不支持安装。
  * 存在多个并发安装尝试。
  * 安装过程中发生页面导航。
* `DataError`：
  * 缺少链接的 manifest，manifest URL 无效或不可访问，发生重定向，或 `Content-Type` 响应头不是 JSON。
  * 缺少必需 manifest 字段，或 `start_url` 与 `manifest` 不同源。
  * manifest 省略 `id` 且未提供 `manifestId`，或者 `manifestId` 与 manifest 处理后的 ID 不一致。
* `NotAllowedError`：
  * 缺少瞬时用户激活。
* `TypeError`：
  * options 参数缺少 `manifest`，或 `manifest` / `manifestId` 为空或无法解析为 URL。
* `InvalidStateError`：
  * 从已分离的文档、子 frame 或 fenced frame 中调用了 API。
* `SecurityError`：
  * `web-app-installation` Permissions Policy 被禁用，或文档处于沙箱中。

<a id="fallback-strategies"></a>

## 回退策略

Web Install API 属于渐进增强。即使缺少这两个现代入口，只要浏览器支持安装 Web 应用，仍会提供自己的安装 UI。

<a id="web-app-manifest-fallback"></a>

### Web 应用 manifest 的回退

Web app manifest 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 53（2016 年 8 月）、Edge 79（2020 年 1 月）、Safari 17（2023 年 9 月）和 Safari iOS 15.4（2022 年 3 月）。
不支持的浏览器：Firefox。

不使用 Web 应用 manifest 的浏览器，仍可以将应用呈现为普通网站。将安装和独立显示视为增强能力；无法通过 manifest 安装时，不要阻止核心功能访问。

<a id="install-fallback"></a>

### `<install>` 的回退

目前还没有主流浏览器原生支持 <install>。

`<install>` 支持回退子内容，供无法渲染浏览器控制安装按钮的浏览器使用。如果产品有持续维护的安装帮助页面，可以在回退内容中链接该页面。

```html
<install>
  <!-- Rendered only when the browser does not provide the install control. -->
  <a href="/install-help">How to install this app</a>
</install>
```

如果浏览器专用说明可能不准确或难以维护，就让元素保持为空。这样在不支持的浏览器中，不会渲染无法工作的替代控件。

自定义安装按钮应单独渲染并带有 `hidden`，仅在支持 `navigator.install()` 或已经捕获 `beforeinstallprompt` 事件时显示。不要在回退内容中放置始终可见、仿制浏览器安装按钮的控件。

<a id="navigatorinstall-fallback"></a>

### `navigator.install()` 的回退

目前还没有主流浏览器原生支持 navigator.install()。

`navigator.install()` 不可用时，使用 `beforeinstallprompt` 事件回退安装当前应用。与 `navigator.install()` 不同，该事件不能安装其他应用。

<a id="beforeinstallprompt-fallback"></a>

### `beforeinstallprompt` 的回退

beforeinstallprompt 的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 76（2019 年 7 月）和 Edge 79（2020 年 1 月）。
不支持的浏览器：Firefox 和 Safari。

捕获该事件、阻止其自动提示，只在浏览器确认可以弹出安装提示后，才显示自定义安装按钮。使用单个点击处理器：有 `navigator.install()` 时优先使用，否则使用捕获的事件。该事件只能使用一次，因此在等待用户选择之前就丢弃它，并隐藏按钮，除非出现新的 `beforeinstallprompt` 事件。

```js
const installButton = document.querySelector("#install-app");
const installStatus = document.querySelector("#install-status");
const supportsWebInstall =
  typeof Navigator.prototype.install === "function";
let deferredInstallPrompt;

if (supportsWebInstall) {
  installButton.hidden = false;
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;

  // Prefer navigator.install() when both mechanisms are available.
  if (!supportsWebInstall) {
    installButton.hidden = false;
  }
});

installButton.addEventListener("click", async () => {
  if (installButton.getAttribute("aria-disabled") === "true") {
    return;
  }
  // Use aria-disabled instead of disabled so activating the button does not drop focus.
  installButton.setAttribute("aria-disabled", "true");

  try {
    if (supportsWebInstall) {
      // Call directly from this handler to preserve transient user activation.
      await navigator.install();
      installStatus.textContent = "The app was installed or opened.";
      installButton.hidden = true;
    } else if (deferredInstallPrompt) {
      // Save and clear the single-use event before awaiting the user's choice.
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = undefined;
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;

      installStatus.textContent =
        outcome === "accepted"
          ? "The app was installed."
          : "Installation canceled.";
      if (!deferredInstallPrompt) {
        installButton.hidden = true;
      }
    }
  } catch (error) {
    if (error.name === "AbortError") {
      // Cancellation is an expected user choice; keep the button available to retry.
      installStatus.textContent = "Installation was canceled or could not complete.";
    } else {
      installStatus.textContent = "Installation could not start.";
      console.error(error);
    }
  } finally {
    installButton.removeAttribute("aria-disabled");
  }
});
```

在两种机制都不支持的浏览器中，不要显示无法工作的安装按钮。隐藏按钮是一种优雅降级，用户仍能使用浏览器自身提供的安装入口。除非产品已经针对这些浏览器建立经过测试且持续维护的引导流程，否则不要把隐藏按钮替换为按浏览器区分的分步说明。