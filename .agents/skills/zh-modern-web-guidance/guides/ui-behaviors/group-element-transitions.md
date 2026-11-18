<a id="smoothly-rearrange-cards-lists-and-groups-of-elements-on-add-remove-or-reorder"></a>

# 添加、移除或重排时平滑调整卡片、列表和元素组

列表添加、移除或重新排列项目时，过渡能帮助用户保持上下文。视图过渡通过唯一 `view-transition-name` 在元素两个状态间动画。页面多个元素共享过渡行为时，`view-transition-class` 允许在 CSS 定义一次逻辑，不必为每个唯一的 `view-transition-name` 重复。这保持样式表可维护，并让元素组动画一致。

<a id="implementation-steps"></a>

## 实现步骤

1. **分配唯一名称和共享类**

   过渡期间需要单独跟踪的每个元素都必须有唯一 `view-transition-name`。

   ```html
   <!-- Mandatory: Each element must have a unique view-transition-name -->
   <li style="view-transition-name: item-1" class="item">Item 1</li>
   <li style="view-transition-name: item-2" class="item">Item 2</li>
   ```

   还要分配 `view-transition-class` 来应用共享样式。

   ```css
   .item {
     view-transition-class: list-item;
   }
   ```

2. **定义共享过渡逻辑**

   用针对 `view-transition-class` 的 `::view-transition-group()` 伪元素，为组内所有成员应用动画样式。

   ```css
   /* Targets any view transition group that has the 'list-item' view-transition-class */
   ::view-transition-group(.list-item) {
     /* Duration and non-linear easing are examples; customize with any ease* keyword, cubic-bezier(), or multi-stop linear() curve */
     animation-duration: 0.5s;
     animation-timing-function: ease-in-out;
   }

   /* Handle accessibility by respecting motion preferences */
   @media (prefers-reduced-motion: reduce) {
     /* Disable all group transitions, including the default `root` group. */
     ::view-transition-group(*),
     ::view-transition-old(*),
     ::view-transition-new(*) {
       animation: none !important;
     }
   }
   ```

3. **定义进入和退出动画（添加或移除项目时）**

   使用 `:only-child` 为新增或移除元素提供专用过渡。`::view-transition-new()` 与 `::view-transition-old()` 都是 `::view-transition-image-pair()` 的子元素，因此唯一子元素表示新增或移除。进入通常使用减速曲线（如 `ease-out`），让新增项减速落位；退出通常使用加速曲线（如 `ease-in`），让移除项加速离开。

   ```css
   /* A `::view-transition-new()` element is the only child if it wasn't present before the view transition, so it is an added element. */
   ::view-transition-new(.list-item):only-child {
     animation-name: slide-in;
     /* Override the duration inherited from ::view-transition-group(.list-item) if desired (example value) */
     animation-duration: 1s;
     /* Entry effects typically ease out as the element settles into place */
     animation-timing-function: ease-out;
   }
   /* A `::view-transition-old()` element is the only child if it isn't present after the view transition, so it is a removed element. */
   ::view-transition-old(.list-item):only-child {
     animation-name: slide-out;
     /* Override the duration inherited from ::view-transition-group(.list-item) if desired (example value) */
     animation-duration: 1s;
     /* Exit effects typically ease in as the element leaves */
     animation-timing-function: ease-in;
   }

   @keyframes slide-in {
     from {
       translate: -100vw 0;
     }
   }
   @keyframes slide-out {
     to {
       translate: -100vw 0;
     }
   }
   ```

4. **触发过渡**

   用 `document.startViewTransition()` 包裹 DOM 更新。浏览器截取旧状态，执行更新，再动画到新状态。

   ```javascript
   function updateList(newData) {
     document.startViewTransition(() => {
       // All DOM changes inside this callback will be transitioned
       render(newData);
     });
   }
   ```

5. **保持未参与过渡元素的交互性**

   视图过渡通过覆盖 DOM 快照并对快照动画实现，因此过渡期间元素不可交互。若其他交互元素未参与过渡，可通过禁用视图过渡的指针事件，让它们可交互。

   ```css
   ::view-transition {
     /* Non-transitioned elements below the view transitions remain interactive */
     pointer-events: none;
   }
   ```

   此外，`:root` 默认具有名为 `root` 的过渡，启用整页默认效果。根元素无变化时，这会在两个相同且不可交互的快照之间过渡。我们只过渡特定元素，不是整屏，因此可禁用 `root` 过渡。

   ```css
   :root {
     /* Disable the root transition because we are only transitioning specific elements. */
     view-transition-name: none;
   }
   ```

<a id="fallback-strategies"></a>

## 回退策略

<a id="view-transitions"></a>

### 视图过渡

View transitions 的 Baseline 状态：新近可用。自 2025-10-14 起纳入 Baseline。
支持版本：Chrome 111（2023 年 3 月）、Edge 111（2023 年 3 月）、Firefox 144（2025 年 10 月）和 Safari 18（2024 年 9 月）。

视图过渡是渐进增强。不支持 `document.startViewTransition` 时立即更新 DOM，提供功能完整但无动画的体验：

```javascript
if (document.startViewTransition) {
  document.startViewTransition(() => updateDOM());
} else {
  // Fallback: Perform the update without animation
  updateDOM();
}
```

<a id="view-transition-class"></a>

### `view-transition-class`

view-transition-class 的 Baseline 状态：新近可用。自 2025-10-14 起纳入 Baseline。
支持版本：Chrome 125（2024 年 5 月）、Edge 125（2024 年 5 月）、Firefox 144（2025 年 10 月）和 Safari 18.2（2024 年 12 月）。

无法识别 `view-transition-class` 或 `::view-transition-group(.class)` 的浏览器会忽略相关 CSS，但仍更新 DOM，并在支持时运行基础视图过渡。
