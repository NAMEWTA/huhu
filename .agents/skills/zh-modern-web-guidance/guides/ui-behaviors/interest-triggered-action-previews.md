<a id="interest-triggered-action-previews"></a>

# 兴趣触发的操作预览

用户正式执行操作前提供预览可能很有帮助。Interest Invokers 是实验性 Web 平台特性，以声明式方式在兴趣源（按钮或链接）与兴趣目标间建立关联。建立后，开发者可通过 CSS 和 JavaScript 在获得或失去兴趣时响应。本用例使用 `interest` 和 `loseinterest` 事件，预览作用于目标的不同效果。

兴趣触发的操作预览不用于提供额外信息，只应提供界面其他位置已有的次要信息，或通过选择不会触发提交的控件也能获得的信息。这是因为并非所有人都能获取操作预览显示的信息，尤其是使用辅助技术的人；因此，**绝不能**把它作为访问信息的唯一方式。

<a id="how-to-implement"></a>

## 实现方法

在按钮或链接（兴趣源）上设置 `interestfor`，其值引用另一个元素（兴趣目标）的 ID，即建立关联。每个调用器或兴趣源只能有一个目标，但一个目标可对应多个调用器。

```html
<!-- 必须：在按钮或链接上使用 interestfor 属性建立兴趣关系。 -->
<button interestfor="interestingElement" data-effect="A">Some effect</button>
<button interestfor="interestingElement" data-effect="B">Some other effect</button>
<div id="interestingElement">Something interesting</div>
```

本用例通过 `interest` 和 `loseinterest` 预览目标效果。两者都是 `InterestEvent`，具有指向兴趣源（带 `interestfor` 元素）的 `source` 属性。

```javascript
interestingElement.addEventListener("interest", event => {
  // 根据 event.source 应用预览。
  event.target.dataset.preview = event.source.dataset.effect;
});

interestingElement.addEventListener("loseinterest", event => {
  // 取消预览效果。
  delete event.target.dataset.preview;
});
```

> [!NOTE]
> **不要通过实时区域播报兴趣驱动的预览。** 只要指针经过页面或按 Tab 穿过附近按钮就可能触发兴趣，因此反复播报应用/撤销很快会成为噪声，淹没用户真正关心的内容。预览本身就是提示；能感知它的人直接受益，不能感知的人也不会因口头重复“正在预览效果 A”而受益。如果特定场景确实需要播报，请认真与用户测试。

CSS 可分别通过 `:interest-source` 和 `:interest-target` 选择当前活动的兴趣源与目标。

```css
/* 预览效果时应用的样式。 */
:interest-source {}
:interest-target {}
```

兴趣调用器（带 `interestfor` 的元素）的开始和结束延迟，可通过 `interest-delay-start`、`interest-delay-end` 或简写 `interest-delay` 设置。

```css
[interestfor] {
  interest-delay-start: 0.2s;
  interest-delay-end: 0.1s;
}
```

<a id="fallback-strategies"></a>

### 回退策略

<a id="fallbacks--browser-support-for-interest-invokers"></a>

### Interest invokers 的回退方案和浏览器支持

Interest invokers 的浏览器支持：有限可用。
支持版本：Chrome 149（2026 年 6 月）和 Edge 149（2026 年 6 月）。
不支持：Firefox 和 Safari。

必须用 NPM 上的 `interestfor` polyfill 包按条件补齐 Interest invokers。优先将 polyfill 打包，而非从 CDN 加载。

**必须：** 检测 `HTMLButtonElement.prototype` 是否具有 `interestForElement` 属性，**仅在**缺少原生支持时加载 polyfill。

```html
<script type="module">
  if (!("interestForElement" in HTMLButtonElement.prototype)) {
    // CDN 链接仅用于示例，优先打包。
    await import("https://unpkg.com/interestfor@latest");
  }
</script>
```

<a id="css-polyfill-caveats"></a>

### CSS polyfill 注意事项

使用 polyfill 时，CSS API 会略有变化，以适应缺少原生伪类和属性支持的情况：

- **伪类：** polyfill 无法定义真正的 `:interest-source` 和 `:interest-target` 伪类，因此改用 `.interest-source` 和 `.interest-target` 类。**必须：** 用 `:is()` 组合原生与 polyfill 状态。

```css
/* 预览效果时应用的样式。 */
:is(:interest-source, .interest-source) { /* ... */ }
:is(:interest-target, .interest-target) { /* ... */ }
```

- **CSS 属性：** 对 `interest-delay`、`interest-delay-start` 和 `interest-delay-end`，polyfill 要求使用 CSS 变量，因为它无法在所有浏览器中直接读取这些自定义属性。

```css
/* 调整兴趣调用器的开始和结束延迟。 */
[interestfor] {
  --interest-delay-start: 0.2s;
  interest-delay-start: var(--interest-delay-start);
  --interest-delay-end: 0.1s;
  interest-delay-end: var(--interest-delay-end);
}
```

如果已有兴趣触发的浮层打开，且用户可能快速连续移过多个触发器，将初始延迟设为 `0s`。

```css
.container:has([interestfor]:is(:interest-source, .interest-source)) [interestfor] {
  --interest-delay-start: 0s;
}
```