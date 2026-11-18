<a id="lazy-load-video-and-audio"></a>

# 懒加载视频和音频

媒体元素（`<video>` 和 `<audio>`）及其关联资源，例如 `<video poster>` 图片和预加载元数据，会在初始页面加载时消耗大量网络与存储带宽。即使为 `<video>` 设置 `preload="metadata"` 或 `preload="none"`，浏览器仍会立即积极获取其 `poster` 图片；而 `preload="metadata"` 仍会为页面上的每个播放器发起媒体头部的范围请求。

为屏幕外的 `<video>` 和 `<audio>` 设置 `loading="lazy"`，可以指示浏览器推迟所有媒体网络请求，包括 `poster` 图片下载、`preload` 提示和 `autoplay` 执行，直到元素到达浏览器计算出的视觉视口附近距离。

<a id="how-to-implement"></a>

## 如何实现

1. **为屏幕外媒体添加 `loading="lazy"`**：将 `loading="lazy"` 应用到首屏以下的 `<video>` 和 `<audio>`。首屏内媒体省略 `loading` 属性，让它默认使用 `eager`。
2. **为 `<video>` 显式设置 `width` 和 `height`**：始终给 `<video>` 指定整数形式的 `width` 和 `height` 属性，单位为 CSS 像素。未加载视频的默认尺寸为 `300`×`150`；缺少显式尺寸时，懒加载视频可能无法与可见视口相交，因而永远不加载，也可能在加载后引发明显的布局位移（CLS）。
3. **为 `<audio>` 包含 `controls` 属性**：始终为 `<audio loading="lazy">` 添加 `controls`。如果没有浏览器控件，`<audio>` 没有固有的视觉盒子；不带 `controls` 的 `<audio loading="lazy">` 无法在视觉上与视口相交，因此永远不会加载或自动播放。
4. **协调 `preload` 和 `poster` 属性**：
   - 对于 `<video loading="lazy">`，`poster` 图片请求和 `preload` 行为（`none`、`metadata` 或 `auto`）都会推迟到视频接近视口时。
   - 如果用户滚动到媒体后必须明确点击播放，将 `loading="lazy"` 与 `preload="none"` 配合使用；如果希望播放器进入视口后自动显示时长和初始帧数据，则配合 `preload="metadata"`。
5. **安全处理懒加载的 `autoplay`**：在静音 `<video>` 或用户选择启用的 `<audio controls>` 上组合 `loading="lazy"` 和 `autoplay` 时，播放与下载都会等待元素接近视口。自动播放带运动效果的媒体之前，始终尊重 `@media (prefers-reduced-motion: reduce)`。

如果媒体计划自动播放，而且音频播放超过 3 秒，就必须提供暂停、停止或独立调节音量的方法，以符合 WCAG 1.4.2 音频控制要求。

<a id="example-code"></a>

## 示例代码

```html
<!-- Above-the-fold hero video: DO NOT use loading="lazy".
     Omit loading (defaults to "eager") so the poster and initial media load immediately. -->
<video
  controls
  width="1280"
  height="720"
  poster="/images/hero-poster.jpg"
  preload="metadata"
>
  <source src="/media/keynote.webm" type="video/webm">
  <source src="/media/keynote.mp4" type="video/mp4">
  <track src="/media/keynote-en.vtt" kind="captions" srclang="en" label="English">
</video>

<!-- Below-the-fold video player:
     MANDATORY: Specify integer width and height attributes so the unloaded video
     has a non-zero layout box to intersect the viewport and avoids layout shift.
     Both the poster image and preload="metadata" are deferred until near the viewport. -->
<video
  controls
  loading="lazy"
  width="800"
  height="450"
  poster="/images/tutorial-poster.jpg"
  preload="metadata"
>
  <source src="/media/tutorial.webm" type="video/webm">
  <source src="/media/tutorial.mp4" type="video/mp4">
  <track src="/media/tutorial-en.vtt" kind="captions" srclang="en" label="English">
</video>

<!-- Below-the-fold inline product loop:
     With loading="lazy" and autoplay, downloading and playback wait until the
     video approaches the viewport. Include muted and playsinline for autoplay. -->
<video
  controls
  loading="lazy"
  autoplay
  loop
  muted
  playsinline
  width="640"
  height="360"
  poster="/images/feature-loop-poster.jpg"
>
  <source src="/media/feature-loop.webm" type="video/webm">
  <source src="/media/feature-loop.mp4" type="video/mp4">
  <track src="/media/feature-loop-en.vtt" kind="captions" srclang="en" label="English">
</video>

<!-- Below-the-fold audio player:
     MANDATORY: Include the controls attribute. Lazy-loaded <audio> without
     controls is invisible, cannot intersect the viewport, and will never load. -->
<figure>
  <figcaption id="episode-title">Episode 42: Browser Architecture Deep Dive</figcaption>
  <audio
    controls
    loading="lazy"
    preload="metadata"
    src="/media/episode-42.mp3"
    aria-labelledby="episode-title"
    aria-details="episode-transcript"
  ></audio>
  <details id="episode-transcript">
    <summary>View transcript</summary>
    <p>Transcript content for Episode 42...</p>
  </details>
</figure>
```

```javascript
// Pause autoplaying videos when the user prefers reduced motion
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function syncReducedMotion(prefersReducedMotion) {
  for (const video of document.querySelectorAll('video[autoplay]')) {
    if (prefersReducedMotion) {
      video.removeAttribute('autoplay');
      video.pause();
    }
  }
}

syncReducedMotion(reducedMotionQuery.matches);
reducedMotionQuery.addEventListener('change', (event) => {
  syncReducedMotion(event.matches);
});
```

<a id="best-practices"></a>

## 最佳实践

- **必须**：始终为 `<video>` 显式设置 `width` 和 `height`。未加载视频的固有尺寸为 `300`×`150`，如果不与页面可见部分相交，就永远不会加载。
- **必须**：始终为 `<audio loading="lazy">` 添加 `controls`。没有 `controls` 的懒加载 `<audio>` 不会以可见形式渲染，因此永远不会加载或自动播放。
- **不要**给首屏内或最大内容绘制（LCP）对应的 `<video>` 设置 `loading="lazy"`，因为这会同时延迟 `poster` 图片和视频数据的获取。
- **应当**在希望使用默认积极加载时省略 `loading` 属性，不要显式写 `loading="eager"`。
- **不要**依赖 `window` 的 `load` 事件判断懒加载 `<video>` 或 `<audio>` 是否已经加载。`load` 事件只根据积极加载的媒体触发，即使 `loading="lazy"` 媒体最初就在视觉视口内也是如此。
- **应当**注意，只有启用 JavaScript 时，浏览器才会推迟 `loading="lazy"` 媒体加载。这是一种反跟踪措施，防止服务器在脚本被禁用时通过媒体请求推断滚动位置。

<a id="fallback-strategy"></a>

## 回退策略

媒体懒加载的浏览器支持情况：Limited availability。
支持的浏览器：Chrome 150（2026 年 6 月）和 Edge 150（2026 年 7 月）。
不支持的浏览器：Firefox 和 Safari。

如果 Baseline 目标不支持 `<video>` 和 `<audio>` 的 `loading="lazy"`，根据带宽节约要求的严格程度，在渐进增强和 `IntersectionObserver` 回退之间选择：

<a id="progressive-enhancement-recommended-default"></a>

### 渐进增强（建议作为默认方式）

无法识别 `<video>` 和 `<audio>` 上 `loading="lazy"` 的浏览器会忽略它，退回由 `preload` 属性控制的标准加载。将 `loading="lazy"` 与 `preload="none"` 或 `preload="metadata"` 组合，可以确保不支持的浏览器仍不会提前下载完整媒体文件，不过 `<video poster>` 图片和 `preload="metadata"` 的头部仍会积极获取。

<a id="custom-code-fallback-intersectionobserver"></a>

### 自定义代码回退（`IntersectionObserver`）

如果 Baseline 目标要求在不具备原生支持的浏览器中，也严格推迟 `<video poster>` 下载、`preload="metadata"` 请求或按视口触发的播放，应检测 `Object.hasOwn(HTMLMediaElement.prototype, 'loading')`，然后回退到 `IntersectionObserver`：

```javascript
// Feature-detect native media lazy loading on HTMLMediaElement.prototype
const supportsLazyMedia = Object.hasOwn(HTMLMediaElement.prototype, 'loading');

if (!supportsLazyMedia) {
  const lazyMediaElements = document.querySelectorAll(
    'video[loading="lazy"], audio[loading="lazy"][controls]',
  );

  // Example-only rootMargin value; adjust distance threshold for your layout
  const mediaObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const media = entry.target;

        // Restore deferred poster and preload attributes when entering the viewport
        if (media.dataset.poster) {
          media.poster = media.dataset.poster;
          delete media.dataset.poster;
        }

        if (media.dataset.preload) {
          media.preload = media.dataset.preload;
          delete media.dataset.preload;
        }

        if (media.dataset.src) {
          media.src = media.dataset.src;
          delete media.dataset.src;
        }

        for (const source of media.querySelectorAll('source[data-src]')) {
          source.src = source.dataset.src;
          delete source.dataset.src;
        }

        media.load();
        observer.unobserve(media);
      }
    },
    { rootMargin: '200px 0px' },
  );

  for (const media of lazyMediaElements) {
    // Hold back network fetches in unsupported browsers until intersection
    if (media.hasAttribute('poster')) {
      media.dataset.poster = media.getAttribute('poster');
      media.removeAttribute('poster');
    }
    if (media.hasAttribute('preload') && media.getAttribute('preload') !== 'none') {
      media.dataset.preload = media.getAttribute('preload');
    }
    media.preload = 'none';
    mediaObserver.observe(media);
  }
}
```
