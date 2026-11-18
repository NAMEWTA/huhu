<a id="physics-based-easing"></a>

# 基于物理的缓动

`ease-in`、`cubic-bezier()` 等传统 CSS 缓动局限于简单曲线，无法创建弹跳或弹簧等复杂物理效果。`linear()` 通过一系列插值点近似复杂曲线：过渡和动画在相邻点之间线性插值，点足够多时看起来平滑。

<a id="implementation-steps"></a>

### 实现步骤

1. **生成曲线插值点：** 手工绘制数十个弹簧或弹跳点不现实。使用外部库时间函数，或通过工具将现有 JavaScript 缓动或 SVG 路径转成 `linear()`。可选存为 CSS 自定义属性，供全站复用。
2. **定义时间函数：** 将生成的点应用到 `transition-timing-function`、`animation-timing-function`，或 `transition`、`animation` 简写。
3. **调整持续时间：** 与根据质量、刚度推导时长的 JavaScript 物理引擎不同，CSS 仍需固定 `duration`，可能需要调整以获得预期效果。

<a id="example-spring-easing"></a>

### 示例：弹簧缓动

此示例用自定义 `linear()` 创建越过目标值再稳定的弹簧效果。

```css
.spring {
  /* Define the physics-based easing as a reusable variable */
  --spring-easing: linear(0, 0.016 0.5%, 0.06 1%, 0.226 2%, 1.116 5.4%, 1.375 6.6%, 1.527 7.7%, 1.565 8.2%, 1.585 8.8%, 1.581 9.3%, 1.559 9.8%, 1.458 10.9%, 0.937 14.3%, 0.784 15.5%, 0.693 16.6%, 0.67 17.1%, 0.657 17.7%, 0.671 18.7%, 0.729 19.8%, 1.042 23.3%, 1.13 24.5%, 1.182 25.6%, 1.201 26.7%, 1.192 27.7%, 1.156 28.8%, 0.977 32.2%, 0.925 33.4%, 0.894 34.5%, 0.882 35.6%, 0.887 36.6%, 0.907 37.7%, 1.045 42.4%, 1.069 44.5%, 1.059 46.3%, 0.979 50.9%, 0.96 53.4%, 0.966 55.3%, 1.013 59.9%, 1.024 62.3%, 0.986 71.2%, 1.008 79.9%, 0.995 88.9%, 1);


  /* Apply the easing with a duration that fits the spring's complexity */
  /* MANDATORY: Always include a duration; linear() does not calculate it automatically */
  transition: scale 0.8s var(--spring-easing);
}

.spring:hover {
  scale: 1.2;
}
```

<a id="example-bounce-easing"></a>

### 示例：弹跳缓动

此示例用自定义 `linear()` 创建弹跳效果。

```css
.bounce {
  /* Define the physics-based easing as a reusable variable */
  --bounce-easing: linear(0, 0.214 14.7%, 0.386 23.7%, 0.598 31.9%, 0.999 44.7%, 0.807 52.6%, 0.762 56%, 0.747 59.4%, 0.758 62.4%, 0.793 65.6%, 0.999 77.4%, 0.961 81.2%, 0.949 84.8%, 0.956 88%, 0.993 95.5%, 1);


  /* Apply the easing with a duration that fits the bounce's complexity */
  /* MANDATORY: Always include a duration; linear() does not calculate it automatically */
  transition: scale 0.4s var(--bounce-easing);
}

.bounce:hover {
  scale: 1.2;
}
```

<a id="key-considerations"></a>

### 关键考量

* **性能：** 将 `linear()` 应用于独立线程运行的属性，例如 `transform`、`opacity`，获得最流畅物理动画。
* **精度与体积：** 更多点使曲线更平滑，也增大 CSS。多数生成器可“简化”曲线，平衡平滑度与体积。
* **弹跳避免用于透明度：** 结果越过 0 或 1 时，对 `opacity` 应用弹跳可能产生令人不适的闪烁。
* **无障碍：** 复杂物理动画可能使用户分心或产生动态敏感症状。始终尊重偏好，减少或禁用这些动画。

```css
@media (prefers-reduced-motion: reduce) {
  .element {
    transition: none;
  }
}
```

<a id="fallback-strategies"></a>

### 回退策略

linear() easing 的 Baseline 状态：广泛可用。自 2023-12-11 起纳入 Baseline。
支持版本：Chrome 113（2023 年 5 月）、Edge 113（2023 年 5 月）、Firefox 112（2023 年 4 月）和 Safari 17.2（2023 年 12 月）。

<a id="css-fallback"></a>

#### CSS 回退
不支持 `linear()` 时，提供标准缓动。浏览器忽略未知 `linear()` 值，回退到上一条有效声明。

```css
.element {
  /* Fallback for older browsers (standard smooth exit) */
  transition: transform 0.8s ease-out;
  
  /* Modern browsers will override with the physics-based easing */
  transition-timing-function: linear(0, 1.1, 0.95, 1.02, 1);
}
```

<a id="javascript-library-fallback-motiongsap"></a>

#### JavaScript 库回退（Motion/GSAP）

可选：旧浏览器也必须高保真物理动画时，用 **Motion**（motion.dev）或 **GSAP**（greensock.com）处理不支持 `linear()` 的情况。

1. **检测支持：** 用 `CSS.supports()` 检查 `linear()`。
2. **按条件加载/应用：** 不支持时使用库的弹簧或弹跳实现。

```javascript
/* Detect if the browser supports the linear() function */
const supportsLinearEasing = window.CSS && CSS.supports('animation-timing-function', 'linear(0, 1)');

if (!supportsLinearEasing) {
  /* 
     Example using Motion (motion.dev) for a spring fallback.
     This should only be initialized if native CSS support is missing.
  */
  import("https://cdn.jsdelivr.net/npm/motion@latest/dist/motion.js").then(({ animate, spring }) => {
    animate(".element", { transform: "scale(1.2)" }, {
      easing: spring({ stiffness: 100, damping: 10 })
    });
  });
}
```

也可用 CSS `@supports` 更明确地检测：

```css
@supports not (animation-timing-function: linear(0, 1)) {
  .element {
    /* Alternative experience for unsupported browsers */
    transition-duration: 0.4s;
    transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}
```
