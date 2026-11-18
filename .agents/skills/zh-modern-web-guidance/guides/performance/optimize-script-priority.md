<a id="optimize-script-priority"></a>

# 优化脚本优先级

浏览器会根据脚本在文档中的位置，以及是否具有 `async`、`defer` 等属性，分配默认优先级。`fetchpriority` 让开发者能够明确控制优先级，确保关键脚本先加载，非必要脚本不与其争用资源。

<a id="how-to-implement"></a>

## 如何实现

1. **识别关键脚本**：确定哪些脚本对页面核心功能或初始用户交互至关重要。
2. **提高关键异步脚本的优先级**：对于通过 `async` 或 `defer` 加载的关键脚本，添加 `fetchpriority="high"`，确保它们在发现阶段得到优先处理。
3. **降低非必要脚本的优先级**：对于无需立即执行的脚本，例如分析、广告或首屏以下的小组件，添加 `fetchpriority="low"`，并确保具有 `async`、`defer` 或 `module` 属性以避免阻塞。
4. **安排阻塞解析脚本的顺序**：对 body 末尾阻塞解析的脚本使用 `fetchpriority="low"`，避免它们与更关键的资源争用带宽。

<a id="example-code"></a>

## 示例代码

```html
<!-- Elevate the priority of the critical app logic -->
<script src="/js/app.js" async fetchpriority="high"></script>

<!-- Deprioritize non-essential tracking scripts -->
<script src="/js/tracker.js" async fetchpriority="low"></script>

<!-- Deprioritize late-body scripts to favor critical images or CSS -->
<script src="/js/legacy-widgets.js" fetchpriority="low"></script>
```

<a id="best-practices"></a>

## 最佳实践

- **必须**：最多只对 1–2 个关键脚本使用 `fetchpriority="high"`，避免网络争用以及优先级提升效果被稀释。
- **应当**为已知对交互到下一次绘制（INP）至关重要的 `async` 脚本使用 `fetchpriority="high"`。
- **应当**通过 `fetchpriority="low"` 降低初始用户体验不需要的脚本的优先级。
- **不要**在每一个 script 标签上使用 `fetchpriority`；只有明确知道浏览器默认启发式规则不是最佳选择时，才应使用它进行调整。
- **不要**使用已弃用的 `importance` 属性，它已被 `fetchpriority` 取代。

<a id="fallback-strategy"></a>

## 回退策略

Fetch priority 的 Baseline 状态：Newly available。自 2024-10-29 起纳入 Baseline。
支持的浏览器：Chrome 103（2022 年 6 月）、Edge 103（2022 年 6 月）、Firefox 132（2024 年 10 月）和 Safari 17.2（2023 年 12 月）。

`fetchpriority` 属于渐进增强。不支持的浏览器会忽略该属性，继续使用内部调度逻辑，不会报错。基本用法不需要显式的特性检测或回退逻辑。
