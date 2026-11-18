<a id="faster-spa-view-transitions-via-state-caching"></a>

# 通过状态缓存加快 SPA 视图切换

在单页应用（SPA）中缓存非活动视图的渲染状态，而不是销毁这些视图，可以实现近乎即时的视图导航。

<a id="overview"></a>

## 概述

传统做法是在用户切换 SPA 的标签页或视图时，销毁旧视图，或者使用 `display: none` 隐藏它。无论哪一种，用户返回该视图时，浏览器都需要重新创建或重新计算完整的布局与绘制。

为非活动视图使用 `content-visibility: hidden`，浏览器会把元素的内容移出布局流并停止绘制，但会在内存中*保留*缓存的渲染状态。用户切回来时，视图几乎能立即恢复。

<a id="the-cpu-vs-ram-trade-off"></a>

### CPU 与 RAM 的权衡

这种方式能显著提升性能，但也引入了需要仔细管理的权衡：

* **节约 CPU**：非常明显。浏览器完全跳过隐藏视图的布局与绘制过程。
* **RAM 成本**：较高。浏览器会将隐藏视图的全部 DOM 节点、事件监听器和状态保留在内存中。

<a id="when-this-trade-off-becomes-dangerous"></a>

#### 何时这种权衡会带来危险

* **应当**将此策略用于视图数量较少、可以预测的简单应用，例如包含 3–5 个标签页的界面。
* **不要**在会生成几十份独立报告或使用无限动态路由的高度动态应用中，无条件缓存所有视图。这样最终会造成严重内存膨胀，甚至使低端设备的浏览器崩溃。
* **必须**：对于高度动态的应用，**必须**实现**淘汰策略**，例如最近最少使用（LRU）缓存，在达到内存阈值时销毁旧视图。

<a id="implementation"></a>

## 实现

<a id="1-configure-view-containers"></a>

### 1. 配置视图容器

为当前非活动的视图设置 `content-visibility: hidden`。

> [!NOTE]
> `content-visibility: hidden` 隐藏的是元素的*内容*，元素本身仍然有样式且可见。浏览器仍会绘制其背景、边框、内边距和外边距。

```css
.spa-view.inactive {
  /* MANDATORY: Use hidden to cache the rendering state of inactive views */
  content-visibility: hidden;
  
  /* Optional: Prevent hidden views from taking up physical space in layout flow */
  position: absolute;
}
```

<a id="2-manage-focus"></a>

### 2. 管理焦点

切换视图时，确保正确管理键盘焦点，以维持无障碍体验。使用 `inert` 属性，确保隐藏内容中的界面元素不会进入键盘 Tab 顺序。

```javascript
function switchToView(viewId) {
  // Hide all views
  document.querySelectorAll('.spa-view').forEach(view => {
    view.classList.add('inactive');
    view.setAttribute('aria-hidden', 'true');
    view.setAttribute('inert', 'inert');
  });
  
  // Show the target view
  const activeView = document.getElementById(viewId);
  activeView.classList.remove('inactive');
  activeView.setAttribute('aria-hidden', 'false');
  activeView.removeAttribute('inert');
  
  // MANDATORY: Move focus to the new view to ensure a logical tab-order
  activeView.focus();
}
```

<a id="fallback-strategies"></a>

### 回退策略

content-visibility 的 Baseline 状态：Newly available。自 2025-09-15 起纳入 Baseline。
支持的浏览器：Chrome 108（2022 年 11 月）、Edge 108（2022 年 12 月）、Firefox 130（2024 年 9 月）和 Safari 26（2025 年 9 月）。

`content-visibility` 属性可以优雅降级。在不支持它的浏览器中：

* 该属性会被忽略。
* 为了避免回退浏览器同时渲染所有视图，应在 CSS 中提供 `display: none` 回退：

```css
@supports not (content-visibility: hidden) {
  .spa-view.inactive {
    display: none;
  }
}
```
