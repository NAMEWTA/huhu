<a id="semantic-component-adaptation"></a>

# 语义化组件适配

使用样式查询（`@container style()`）触发上下文变体，无需硬编码谁产生上下文、谁响应上下文。这样可减少设计系统耦合，提升扩展性和组件封装。

例如，`section.featured { --surface: featured }` 可以标记某种上下文，落地页也可以通过 `main { --surface: featured }` 默认采用它。组件再选择响应 `--surface: featured`：卡片显示促销徽章，按钮默认使用填充变体，等等。

样式查询让**双方保持解耦**：featured 区域不指定哪些元素应适配它，组件也不检查上下文由谁产生。任一方都可独立扩展（新组件、新 featured 区域），无需修改另一方。后代选择器（例如 `.featured .button`）恰恰相反：必须把关系双方都编码进选择器，任一方变化都需要修改。

<a id="when-to-use-this-guide"></a>

## 何时使用本指南

本指南关注**行为**变化：组件根据上下文决定**渲染什么、如何排列、呈现哪个变体**，例如隐藏/显示徽章、切换布局方向或按钮变体。

如果需要的是**令牌层面**变化，例如密度模式、主题，或让多个组件的 padding、颜色等统一变化的其他高阶令牌，见 `design-token-reactivity`（运行 `npx -y modern-web-guidance@latest retrieve "design-token-reactivity"`）。

<a id="choosing-the-right-tool"></a>

## 选择正确工具

当**上下文关系的双方都可能独立变化**时，使用样式查询：新元素可能开始产生上下文，新组件可能开始响应它。间接层带来的扩展性和封装值得付出成本，而且样式查询能跨越后代选择器无法穿过的 Shadow DOM 边界。不需要这种灵活性时，优先简单工具：

- **后代选择器**（`.toolbar .button`）：固定、一次性、无需复用或扩展的关系。遵循 YAGNI，不添加不会用到的间接层。
- **尺寸查询**（`@container (min-width: …)`）：由可用空间驱动的布局和密度变化，而非语义状态。
- **样式查询**（`@container style(…)`）：语义状态，即组件在某上下文中应渲染、排列或呈现什么。

<a id="implementation-directives"></a>

## 实现要求

1. 用容器上的 CSS 自定义属性定义语义上下文标记。
2. **不要**为样式查询设置 `container-type`；它查询最近祖先上继承的自定义属性，无需显式包含上下文。
3. **强制要求**：使用 `@container style(--property: value)` 有条件地为后代设置样式。样式查询不能匹配设置该属性的元素自身，只能匹配其后代。
4. 关系必须可扩展或跨组件/Shadow DOM 边界时，**应当**优先样式查询而非后代选择器（见上文“选择正确工具”）；对固定、一次性的关系，如果间接层没有收益，仍保留后代选择器。

<a id="implementation-example"></a>

## 实现示例

```css
/* 1. Set the context on a layout container */
.featured {
  --surface: featured; /* Semantic context flag for children */
}

/* 2. Component reacts to inherited flag */
.button {
  /* Default: Outlined informational style */
  background: transparent;
  border: 1px solid currentColor;
}

.badge {
  /* Default: Hidden — only revealed in featured surfaces */
  display: none;
}

@container style(--surface: featured) {
  .button {
    /* Automatic switch to Filled promotional style */
    background: var(--brand-accent);
    color: white;
    border: none;
  }

  .badge {
    /* Reveal decorative elements only in featured context */
    display: block;
  }
}
```

<a id="fallback-strategies"></a>

## 回退策略

容器样式查询的 Baseline 状态：新近可用。自 2026-05-19 起达到 Baseline。
支持：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 151（2026 年 5 月）和 Safari 18（2024 年 9 月）。

在容器样式查询广泛可用前，将它作为渐进增强叠加：提供各处都可用的选择器默认值，支持时再由样式查询覆盖。在上下文选择器上使用 `:where()`，使样式查询凭相同特异性、稍后的源码顺序自动胜出。

```css
/* Default styles — work everywhere */
.button {
  background: transparent;
  border: 1px solid currentColor;
}

.badge {
  display: none;
}

/* Selector-based contextual styles — broad browser support */
:where(.featured) .button {
  background: var(--brand-accent);
  color: white;
  border: none;
}

:where(.featured) .badge {
  display: block;
}

/* Progressive enhancement: style queries override when supported */
@container style(--surface: featured) {
  .button {
    background: var(--brand-accent);
    color: white;
    border: none;
  }

  .badge {
    display: block;
  }
}
```

选择器回退将上下文样式绑定到类名，使组件与 DOM 位置耦合。待样式查询广泛支持后，即可移除 `:where()` 规则。

