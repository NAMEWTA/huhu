<a id="scroll-position-aware-elements"></a>

# 感知滚动位置的元素

<a id="overview"></a>

## 概述

让“返回顶部”链接等浮动按钮只在有用时出现，可以改善用户体验。本指南展示如何用 CSS `container-scroll-state-queries` 构建这些元素，根据容器滚动位置设置样式，无须依赖 JavaScript 滚动监听器或 observer。

<a id="implementation"></a>

## 实现

<a id="1-establish-the-scroll-container"></a>

### 1. 建立滚动容器

必须将滚动容器声明为滚动状态查询容器。

```css
.scroller {
  overflow-y: auto;
  /* Establish this element as a scroll-state query container */
  container-type: scroll-state;
}
```


<a id="2-style-the-floating-element"></a>

### 2. 为浮动元素设置样式

将元素放入容器并设置样式。默认应隐藏。

```css
.back-to-top {
  position: sticky;
  bottom: 20px;
  visibility: hidden;
  opacity: 0;
  translate: 0 20px;
  transition:
    visibility 0.3s,
    opacity 0.3s ease,
    translate 0.3s ease;
}
```


> [!IMPORTANT]
> 粘性或浮动元素悬浮于可滚动内容之上。确保主要内容有足够的底部内边距或外边距，让用户滚动到最底部时，最后几个元素不会一直被按钮遮挡。

<a id="3-respond-to-the-scroll-state"></a>

### 3. 响应滚动状态

使用带 `scroll-state` 函数的 `@container` 规则。要判断用户是否已向下滚动，检查容器是否还能向顶部滚动。

```css
/* When the container can be scrolled toward the top, it means the user has scrolled down */
@container scroll-state(scrollable: top) {
  .back-to-top {
    visibility: visible;
    opacity: 1;
    translate: 0 0;
  }
}
```


<a id="4-manage-focus-and-scroll-container-semantics"></a>

### 4. 管理焦点与滚动容器语义

隐藏依赖滚动位置的元素时，需要考虑控件消失导致的焦点丢失。例如，用户正聚焦于“返回顶部”控件，却使用 `Page Up` 或 `Home` 在后台滚动容器，没有直接激活控件；到达滚动区域顶部后，该控件会隐藏（`visibility: hidden`），否则焦点将重置到 `<body>`。监听 `focusout`，当隐藏控件失去焦点且焦点没有转移到其他元素时，将焦点移至可滚动区域：

<a id="fallback-strategies"></a>

## 回退策略

容器滚动状态查询的浏览器支持状态：有限可用。
支持的浏览器：Chrome 144（2026 年 1 月）和 Edge 144（2026 年 1 月）。
不支持：Firefox 和 Safari。

<a id="basic-fallback"></a>

### 基本回退

如果不支持 `container-scroll-state-queries`，浮动元素会因默认的 `visibility: hidden` 而一直不可见。为保证功能可用，可选择让元素在不支持的浏览器中始终可见。

```css
/* Fallback for browsers that do not support the feature */
.back-to-top {
  visibility: visible; /* Always visible */
  opacity: 1;
}

/* Override for supported browsers to handle dynamic visibility */
@supports (container-type: scroll-state) {
  .back-to-top {
    visibility: hidden;
    opacity: 0;
  }
  
  @container scroll-state(scrollable: top) {
    .back-to-top {
      visibility: visible;
      opacity: 1;
      translate: 0 0;
    }
  }
}
```


<a id="advanced-fallback-intersection-observer"></a>

### 高级回退（Intersection Observer）

如果需要动态可见性，使用 `IntersectionObserver`，在滚动容器顶部的哨兵元素离开视野时切换 class。

```html
<!-- Sentinel element placed at the top of the scroller -->
<div class="scroll-sentinel"></div>
```


```css
/* Marker styling to ensure it does not affect layout */
.scroll-sentinel {
  height: 0;
  width: 0;
  visibility: hidden;
}

.scrolled .back-to-top {
  visibility: visible;
  opacity: 1;
  translate: 0 0;
}
```


```javascript
if (!CSS.supports('container-type', 'scroll-state')) {
  const sentinel = document.querySelector('.scroll-sentinel');
  const scroller = document.querySelector('.scroller');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      // If the sentinel is NOT intersecting, it means the user has scrolled down
      if (!entry.isIntersecting) {
        scroller.classList.add('scrolled');
      } else {
        scroller.classList.remove('scrolled');
      }
    });
  }, { root: scroller });

  observer.observe(sentinel);
}
```

