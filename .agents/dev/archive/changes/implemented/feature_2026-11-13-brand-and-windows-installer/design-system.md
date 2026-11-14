# 规格：设计系统重构（四套可切换主题）

> 本文件是品牌 change 的一部分，与 [spec.md](spec.md)（品牌资产、安装器）并列，权威范围是“主题外观与样式架构”。切片见 [plan.md](plan.md) 的 DS-S1～DS-S4（S3 分 a、b）。
> 参考设计：[design-refs/](design-refs/)，即 VoltAgent/awesome-design-md（MIT，提交 `fcc7028`）中的 claude、apple、notion、vercel 四份 `DESIGN.md`，按原样保存。
> 项目约束：开发阶段，**不做任何兼容**；旧主题、旧设置值、旧 CSS 一律删除，不保留别名或过渡层。仓库在每个切片合入后都必须是整洁的，不留无用代码。

## 1. 目标

1. **四套主题，自由切换**：Claude、Apple、Notion、Vercel。每套都有浅色与深色，跟随系统或手动选择。原有的 Pearl、SuliWorld、Soft 删除。
2. **主题是数据**：一套主题等于一份类型化的定义文件。界面代码只使用语义 token，不认识任何具体主题。
   - 以后新增配色只需加一份定义并注册。
   - 用户自定义主题使用同一份 schema，通过 `extends` 只覆盖部分字段。自定义主题的界面不在本期范围内，但本期的架构和测试要证明它可行（§3.6）。
3. **样式架构重做**：删除从原型原样复制来的 `proto/`（31 个文件，约 21,500 行；其中有重复的变量定义、约 238 处硬编码颜色和死选择器）。按“共享层 + 外壳 + 各插件自带样式”重建，并用 lint 守住规则。

## 2. 参考设计如何转译到工作台

四份 DESIGN.md 分析的是营销网站。HUHU 是桌面工作台，所以只继承各家的**设计语言**，不照搬营销版式。

| 继承 | 不继承 |
| --- | --- |
| 色板与各颜色的职责（画布、表面、墨色、强调、发丝线、语义色） | 营销字号（64～80 px 的 hero 标题）、section 间距（80～192 px） |
| 字体性格：字族、标题字重、字距、行高 | hero 版式、价格卡、摄影、Logo 墙 |
| 形状语法：按钮 / 卡片 / 弹层的圆角体系，例如 Apple 的胶囊主按钮、Notion 的 8 px 矩形按钮 | 依赖营销内容的装饰（Notion 的便签点、Claude 的线稿插画） |
| 层级哲学：Claude 以色块为主、几乎不用阴影；Apple 不给界面元素加阴影，吸顶栏用毛玻璃；Notion 五级阴影；Vercel 叠层阴影加内描边 | — |
| 标志性交互：Apple 按下时 `scale(.95)`；Vercel 的小标签用等宽字体；Claude 焦点环为珊瑚色 15% 外环 | — |
| 品牌装饰：只用在启动页背景（`--launch-backdrop`），例如 Vercel 的网格渐变、Notion 的深海军蓝 | 装饰不进入工作区 |

**可访问性优先于参考值**：参考色不满足 §5 的对比度门槛时，用同一份 DESIGN.md 中的相邻色替代（例如 Claude 按钮底色改用 `primary-active`），并在主题文件中注明原因。找不到相邻色时才允许派生值；派生值在下文表格中标 ★。

## 3. 架构

### 3.1 三层 token

```text
主题定义（TS 数据）──生成──▶ 主题 token（每套主题 × 每种模式一组 CSS 变量）
                                   │
                    共享 token（与主题无关：间距、尺寸、层级、字号阶梯、动效时长）
                                   │
                    组件 / 外壳 / 插件样式 —— 只能使用 var(--语义 token)
```

- **主题 token**：颜色、字族、字重与字距、圆角、阴影、组件形状（§4）。由生成器根据主题定义输出，不手写。
- **共享 token**：手写在 `packages/ui/src/styles/tokens.css`，所有主题共用。密度（comfortable / compact）只影响这一层。
- **组件样式**：不得出现颜色字面量（#hex、rgb()、hsl()、颜色名），也不得引用未定义的变量。组件内部可以定义局部变量，但必须以组件名为前缀，并且只能由语义 token 组合而成。

### 3.2 主题定义

位置：`packages/ui/src/themes/<id>.ts`，每套主题一个文件；`packages/ui/src/themes/index.ts` 汇总导出 `THEMES: Record<ThemeId, ThemeDefinition>`（类型保证每个 id 都有定义）。

```ts
interface ThemeDefinition {
  id: ThemeId;                         // "claude" | "apple" | "notion" | "vercel"
  name: string;                        // 设置页显示名
  description: string;                 // 一句话中文描述
  reference: string;                   // 对应的 design-refs 路径，便于追溯
  extends?: ThemeId;                   // 只覆盖部分字段（§3.6）
  fonts: { ui: string; display: string; mono: string; label: string };   // 完整字族栈
  type: {
    titleWeight: number; titleTracking: string;     // 页面标题 / 分区标题
    bodyLeading: number; strongWeight: number;      // 正文行高；强调字重（Apple 为 600，其余为 500）
    labelTransform: "none" | "uppercase"; labelTracking: string;
  };
  shape: {
    control: string; card: string; popover: string; badge: string;
    buttonPrimary: string;             // 主按钮圆角，Apple 为 9999px
    pressTransform: string;            // 按下效果，Apple 为 "scale(.95)"，其余为 "none"
    focusHalo: string;                 // 焦点环外的柔光（box-shadow 片段），可以为 "none"
  };
  modes: { light: ModeTokens; dark: ModeTokens };
}
interface ModeTokens {
  core: CorePalette;                   // 必填，见 §4.1
  elevation: { card: string; popover: string; dialog: string };  // 完整 box-shadow 值，可为 "none"
  chromeBackdrop: string;              // 例如 Apple 为 "saturate(180%) blur(20px)"，其余为 "none"
  launchBackdrop: string;              // 启动页背景（CSS background 值）
  overrides?: Partial<DerivedPalette>; // 可选：覆盖派生规则的结果（§4.2）
}
```

schema 用 zod 定义在 `packages/ui/src/themes/schema.ts`，主题文件在单元测试中逐个校验。

### 3.3 生成与分发

- **生成器**：纯函数 `themeToCss(def): string`，位于 `packages/ui/src/themes/generate.ts`。它解析 `extends`，按 §4.2 的规则计算派生色，再输出 CSS。
- **颜色计算**：使用 `culori`（MIT，复用优先第 ③ 项）在 OKLab 空间混色，并计算 WCAG 对比度。生成结果全部是具体的十六进制值，CSS 中不使用 `color-mix()`，这样测试可以直接对生成值做断言。
- **产物**：`pnpm gen:themes` 写出 `packages/ui/src/styles/themes.generated.css`，提交进仓库。漂移测试会重新生成并与提交的文件比较，不一致就失败。这套做法借鉴 open-knowledge 的 `gen-color-themes.ts` 与漂移测试（复用 ②）。
- **选择器**：`[data-theme="<id>"][data-mode="<light|dark>"] { … }`，不绑定 `:root`。因此任意元素都能局部套用某套主题，设置页的主题预览卡就是这样渲染的。
- **兜底**：生成器另外输出 `:root:not([data-theme])`，取默认主题（Claude）的浅色，并在 `@media (prefers-color-scheme: dark)` 中取它的深色。这样即使 JS 还没执行，页面也有完整的 token。
- 以后在运行时应用自定义主题时，调用同一个 `themeToCss`，把结果注入 `<style id="huhu-custom-theme">`。生成路径只有这一条。

### 3.4 应用流程

- **唯一所有者**：外观状态由 workbench 中的一个 `AppearanceController` 持有。它对外提供 `set(appearance)` 与 `subscribe`，内部调用 `applyAppearance`，并且只安装一次 matchMedia 监听。现在分散在 `SettingsModule.tsx:35`、`main.tsx:189,216,274` 的调用全部改为经过它。每次应用后派发 `appearance-changed` 事件，终端和 Mermaid 订阅这个事件。
- `applyAppearance(appearance)`（`packages/ui/src/theme.ts`，重写）在 `<html>` 上设置：
  - `data-theme`、`data-mode`（`system` 解析为 light 或 dark）、`data-motion`、`data-density`；
  - 内联变量 `--font-size`、`--sidebar-w`。
- **跟随系统**：`mode: "system"` 时监听 `matchMedia("(prefers-color-scheme: dark)")` 的 `change` 事件并实时切换。目前缺少这个监听，属于缺陷修复。
- **首帧**：启动页没有 Vault。渲染进程在 `localStorage` 的 `huhu.appearance` 中缓存最近一次应用的外观，只用于首帧，避免闪烁；真值仍是 Vault 的 `.huhu/settings.json`（D-26 不变）。没有缓存时，使用默认主题并跟随系统。
- 打开 Vault 后读取设置并应用，同时更新缓存。
- **窗口底色**：`apps/desktop/src/main/index.ts:72` 目前写死 `backgroundColor: "#ffffff"`，深色模式下必然白闪。改为 `show: false`，在 `ready-to-show` 时再显示；底色按 `nativeTheme.shouldUseDarkColors` 取 Claude 的 bg（这是主进程中唯一允许的颜色字面量，与错误页一起列入 §8.2 的排除表）。

### 3.5 设置

`packages/contracts/src/settings.ts` 的 `appearance` 改为：

```ts
appearance: {
  theme: ThemeId;                         // 默认 "claude"（用户 2026-11-13 确认）
  mode: "light" | "dark" | "system";      // 默认 "system"
  fontSize: number;                       // 12–18，默认 14
  density: "comfortable" | "compact";     // 取代布尔值 compact
  motion: "system" | "standard" | "reduced";
  navWidth: number;                       // 176–300，默认 220
}
```

- `THEME_IDS` 常量定义在 contracts 中，ui 的 `ThemeId` 从这里导入。旧值（pearl、suliworld、soft、compact）不做迁移：zod 校验失败的字段回退到默认值，与现有 `normalizeAppearance` 的行为一致。
- **外观页**（系统设置页“外观”）：
  - 主题：四张预览卡，每张卡用 `data-theme` / `data-mode` 局部套用对应主题，渲染一个迷你工作台（侧栏、标题、正文、主按钮、标签），不使用硬编码的预览色。卡片 testid 为 `theme-<id>`。
  - 明暗：浅色 / 深色 / 跟随系统。
  - 字号、密度、动效、导航宽度：保留现有控件。
  - 重置。
- 顶栏的明暗切换（`ThemeToggle`）保留，只切换明暗。
- 外观页抽成独立组件 `AppearancePage`（`packages/workbench/src/settings/AppearancePage.tsx`），由设置注册表注册（与 agent-launch-settings AL-S2 的注册机制衔接，见 plan）。

### 3.6 扩展点（本期验证，不提供界面）

- **新增内置主题**：在 `themes/` 中新增一个文件，在 `THEME_IDS` 和 `THEMES` 中各加一项，然后运行 `gen:themes`。不修改任何组件样式。
- **自定义主题**：数据形状为 `{ extends: ThemeId, name, modes?: { light?: Partial<ModeTokens>; dark?: Partial<ModeTokens> }, … }`，由 `themeToCss` 统一处理。
- 本期用一个**测试夹具主题**证明以上两点：它 `extends: "notion"`，只覆盖 `accent`。测试断言生成的 CSS 中只有 accent 及其派生色不同，并且仍能通过 §5 的对比度检查。夹具只存在于测试中，不进入产品。

## 4. Token 契约

命名沿用现有短语义名（`--bg`、`--text`、`--accent` 等，现有代码中约有 2,300 处引用），不加 `--color-` 前缀。以下为完整的公开 token 列表；除此之外的全局变量一律删除，包括 `--font`、`--mono`、`--radius`、`--ui-*-font`、`--v9-*`、`--blue`、`--violet` 等别名。

### 4.1 核心色（主题必填，每种模式一份）

| token | 职责 |
| --- | --- |
| `--bg` | 工作区画布 |
| `--sidebar` | 模块侧栏 |
| `--chrome` | 顶栏、左侧图标栏 |
| `--panel` | 卡片、输入框、列表容器 |
| `--elevated` | 弹层、菜单、对话框的底色 |
| `--muted-bg` | 悬停、选中、内嵌区域 |
| `--text` / `--muted` / `--faint` | 主文字 / 次要文字 / 弱化文字 |
| `--line` / `--line-strong` | 发丝线 / 输入框边框、强分隔 |
| `--accent` | 品牌强调色：选中指示、进度、图标强调 |
| `--accent-strong` | 主按钮底色与强调色文字；`--accent` 满足对比度时与它相同 |
| `--accent-fg` | 主按钮文字 |
| `--link` | 链接文字（Notion、Vercel 与强调色分开） |
| `--focus` | 焦点环颜色 |
| `--success` / `--warning` / `--danger` / `--info` | 语义色 |
| `--tag-1` … `--tag-8` | 分类色板（标签、看板列、Space 标识），顺序为橙、粉、绿、紫、蓝、黄、青、棕 |

**使用约束**（由 §5 的测试与代码评审保证）：
- `--accent`、`--success` / `--warning` / `--danger` / `--info`、`--tag-n` 这些原色**只能用于填充、图标、边框和指示条**，不能作为文字颜色。
- 文字一律使用对应的派生色：`--accent-text`、`--<status>-text`、`--tag-n-text`。
- 作为背景、上面还要放文字的强调色，一律使用 `--accent-strong`，配 `--accent-fg`。
- DS-S1 按这条规则替换现有用法：约 109 处 `color: var(--success|warning|danger|blue|violet)`，约 14 处 `background: var(--accent)`。

### 4.2 派生色（生成器按规则计算，主题可以通过 `overrides` 覆盖）

| token | 规则（OKLab 混色） |
| --- | --- |
| `--accent-soft` | accent 14% + bg |
| `--accent-text` | accent 与 text 混合，取在 bg 和 panel 上都能达到 4.5:1 的最小混合比（与 `-text` 系列同一搜索方法） |
| `--accent-pressed` | accent-strong 85% + text |
| `--selection` | accent 22% + bg |
| `--<status>-bg`、`--tag-n-bg` | 原色 14%（深色模式为 22%）+ bg |
| `--<status>-text`、`--tag-n-text` | 原色与 text 混合，取能在对应 `-bg` 上达到 4.5:1 的最小混合比（生成器逐级搜索） |
| `--overlay-scrim` | 浅色模式 text 的 40% 透明，深色模式 black 的 60% 透明 |
| `--term-bg` / `--term-fg` / `--term-cursor` / `--term-selection` | 浅色模式：panel / text / accent / selection；深色模式：bg 加深 4% / text / accent / selection |
| `--term-ansi-0` … `--term-ansi-15` | 0 号（黑）取 text 与 bg 中较深的一个，7 号（白）取较浅的一个，8 号（亮黑）取 faint，15 号（亮白）取较浅一侧再向 bg 方向退 10%；红、绿、黄、蓝、品红、青取 danger、success、warning、link、tag-4、tag-7，亮色版本向较浅一侧混 25%。xterm 另外启用 `minimumContrastRatio: 4.5`（xterm 自带功能），保证任何 ANSI 组合都可读 |
| `--diff-add-bg` / `--diff-add-emph` / `--diff-del-bg` / `--diff-del-emph` | success / danger 与 bg 混合，行底色 12%（深色模式 18%），词级强调 28%（深色模式 36%）；diff 文字仍用 text |
| `--syntax-keyword` 等 9 项（keyword、string、number、comment、function、type、variable、punctuation、heading） | 分别取 accent-strong、tag-3-text、tag-1-text、faint、link、tag-4-text、text、muted、text |

- **终端**：xterm 不解析 CSS 变量。`TerminalView` 用 `getComputedStyle(宿主元素)` 读出 `--term-*` 与 `--font-mono` 的具体值，组成 xterm 的 theme 与 fontFamily，并订阅外观变化（§3.4 的 `appearance-changed` 事件）后更新。删除 `tokens.css:41` 的 `#0f1114` 等硬编码值。
- **编辑器**：CodeMirror 的覆盖样式只通过 `EditorView.theme` 写，值使用 `var(--syntax-*)` 等 token。
- **Mermaid**：`MermaidBlock.tsx:7` 目前固定为 `neutral` 主题，改为按 `data-mode` 选择 `default` 或 `dark`，切换时重新渲染。

### 4.3 主题形状与字体 token

| token | 来源 |
| --- | --- |
| `--font-ui`、`--font-display`、`--font-mono`、`--font-label` | `fonts` |
| `--title-weight`、`--title-tracking`、`--body-leading`、`--strong-weight`、`--label-transform`、`--label-tracking` | `type` |
| `--radius-control`、`--radius-card`、`--radius-popover`、`--radius-badge`、`--radius-button-primary`、`--press-transform` | `shape` |
| `--shadow-card`、`--shadow-popover`、`--shadow-dialog`、`--chrome-backdrop`、`--launch-backdrop` | `modes.*` |
| `--focus-ring` | 统一的焦点环：`0 0 0 2px var(--focus)`，可以再加主题的柔光（`shape.focusHalo`，例如 Claude 为 `0 0 0 5px` 珊瑚色 15%）。可辨识度只由 2 px 实线保证，§5 也只检查实线 |
| `color-scheme` | 浅色主题块输出 `light`，深色输出 `dark`，让原生控件和滚动条随之变化 |

### 4.4 共享 token（`tokens.css`，与主题无关）

- **间距**：`--space-1/2/3/4/5/6/8`（4 px 栅格）、`--page-gutter`。
- **尺寸**：`--control-h`、`--row-h`、`--rail-w`、`--sidebar-w`、`--detail-w`。compact 密度时整体收紧。
- **尺寸补充**：`--icon-control-size`、`--control-compact`、`--resource-wide`（现有用法保留，改为在这里定义）。
- **字号阶梯**：使用 `--fs-` 前缀，避免与颜色 `--text*` 混淆。全部基于 `--font-size`：
  - `--fs-page`：24/14 倍。
  - `--fs-section`：16/14 倍。
  - `--fs-body`。
  - `--fs-list`：-1 px，最小 12 px。
  - `--fs-meta`：-2 px，最小 11 px。
  - `--fs-mono`：13/14 倍。
  - `--fs-editor`：16/14 倍。
- **编辑器**：`--editor-line`（行高）、`--editor-measure`（正文最大宽度）。
- **层级**：`--z-sticky/sidebar/popover/dialog/toast/palette`。
- **动效**：
  - 时长：`--motion-fast`、`--motion-base`、`--motion-enter`、`--motion-exit`、`--motion-move`、`--motion-stagger`、`--motion-reduced-fade`。
  - 缓动：`--ease-out`、`--ease-in-out`。
  - `data-motion="reduced"` 或系统偏好减少动效时，除 `--motion-reduced-fade` 外全部为 0。

## 5. 对比度门槛（测试强制执行）

每套主题 × 每种模式都检查以下配对（使用生成值）：

| 配对 | 最低 |
| --- | --- |
| text / bg、panel、sidebar、elevated | 7:1 |
| muted / bg、panel、sidebar | 4.5:1 |
| faint / bg | 3:1 |
| accent-fg / accent-strong | 4.5:1 |
| link / bg、panel | 4.5:1 |
| accent-text / bg、panel | 4.5:1 |
| `<status>-text` / `<status>-bg`，`tag-n-text` / `tag-n-bg` | 4.5:1 |
| focus / bg、panel（2 px 实线部分） | 3:1 |
| line-strong / panel | 1.5:1（输入框边框可辨） |

`packages/ui/test/theme.test.ts` 重写为遍历 `THEMES` 的表驱动测试，不再解析 CSS 文本。

## 6. 四套主题的取值

数值取自对应的 DESIGN.md。★ 表示参考中没有、按 §2 规则派生或借用的值。实施时如果对比度测试失败：
- 先检查是不是用错了 token，例如把原色当文字用（§4.1）。
- 再调整 ★ 值，或换成同一份 DESIGN.md 中的相邻色。
- 无论哪种调整，都在主题文件中注明原因。非 ★ 的参考值不改。

### 6.1 Claude（温暖、书卷气）

- **字体**：
  - display 为 `"Newsreader Variable", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", serif`。Copernicus 不可用，用 Newsreader 替代：它是开源衬线体，原型里已随包，风格接近 Tiempos。中文回退到无衬线，避免 Windows 上落到宋体。
  - ui 为 `"Inter Variable", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif`。
  - mono 为 `"JetBrains Mono Variable", ui-monospace, monospace`。
  - label 同 ui。
- **字体性格**：title 400 / -0.02em（衬线标题不加粗，DESIGN.md 明确禁止）；bodyLeading 1.55；strong 500。
- **形状**：control 8 px，card 12 px，popover 12 px，badge 9999 px，buttonPrimary 8 px；没有按下变形。
- **层级**：以色块为主。card 为 `none`（用 `--muted-bg` 色块或发丝线表达层级）；popover 为 `0 1px 3px rgba(20,20,19,.08), 0 0 0 1px #e6dfd8`；dialog 为 `0 8px 24px rgba(20,20,19,.12)`★。
- **焦点**：2 px 实线 `--focus`，外加 `focusHalo` 为 3 px 珊瑚色 15% 的柔光（DESIGN.md 中 text-input-focused 的写法）。

| 核心色 | 浅色 | 深色 |
| --- | --- | --- |
| bg | #faf9f5 canvas | #181715 surface-dark |
| sidebar | #f5f0e8 surface-soft | #1f1e1b surface-dark-soft |
| chrome | #faf9f5 | #181715 |
| panel | #faf9f5 | #1f1e1b |
| elevated | #faf9f5 | #252320 surface-dark-elevated |
| muted-bg | #efe9de surface-card | #252320 |
| text | #141413 ink | #faf9f5 on-dark |
| muted | #6c6a64 | #a09d96 on-dark-soft |
| faint | #8e8b82 | #6c6a64 |
| line | #e6dfd8 hairline | #2e2c28★ |
| line-strong | #d4cbbd★ | #3d3a35★ |
| accent | #cc785c coral | #cc785c |
| accent-strong | #a9583e primary-active（白字下 #cc785c 仅 3.3:1） | #cc785c |
| accent-fg | #ffffff | #141413 |
| link | #a9583e | #d99a7f★ |
| focus | #cc785c | #cc785c |
| success / warning / danger / info | #5db872 / #d4a017 / #c64545 / #5db8a6 accent-teal | 同左 |
| tag-1…8 | #e8a55a amber、#d97a9a★、#5db872、#8e6fc4★、#5b8fd1★、#d4a017、#5db8a6、#8a6a4a★ | 同左 |
| launchBackdrop | `#faf9f5` | `#181715` |

### 6.2 Apple（克制、画廊式）

- **字体**：
  - ui 与 display 为 `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`。在 macOS 上就是真正的 SF Pro；其他平台用 Inter，标题字距再收紧 -0.01em（DESIGN.md 的替代说明）。
  - mono 为 `ui-monospace, "SF Mono", "JetBrains Mono Variable", monospace`。
  - label 同 ui。
- **字体性格**：title 600 / -0.022em；bodyLeading 1.47；strong 600（DESIGN.md 指出“不用 500”）。
- **形状**：control 8 px，card 18 px，popover 12 px★，badge 9999 px，**buttonPrimary 9999 px（胶囊）**；pressTransform 为 `scale(.95)`。
- **层级**：card 为 `none`，只用发丝线 `rgba(0,0,0,.08)`；popover 为 `0 8px 30px rgba(0,0,0,.12)`★；dialog 为 `0 12px 40px rgba(0,0,0,.18)`★。
- **毛玻璃**：chromeBackdrop 为 `saturate(180%) blur(20px)`，chrome 取 80% 透明的 parchment。只用在内容会从下方滚过的吸顶元素上（列表与表格的吸顶表头、编辑器工具栏）。顶栏是网格布局，内容不会从它下面经过，所以不使用毛玻璃，直接用不透明的 sidebar 色。
- **焦点**：2 px 实线 `--focus`。

| 核心色 | 浅色 | 深色 |
| --- | --- | --- |
| bg | #ffffff canvas | #252527 tile-3 |
| sidebar | #f5f5f7 parchment | #272729 tile-1 |
| chrome | rgba(245,245,247,.8) | rgba(0,0,0,.8) surface-black |
| panel | #ffffff | #2a2a2c tile-2 |
| elevated | #fafafc pearl | #2a2a2c |
| muted-bg | #f0f0f0 divider-soft | #333336★ |
| text | #1d1d1f | #ffffff |
| muted | #6e6e73★（#7a7a7a 在白底上只有 4.3:1） | #cccccc body-muted |
| faint | #7a7a7a ink-muted-48 | #7a7a7a |
| line | #e0e0e0 hairline | #3a3a3c★ |
| line-strong | #d2d2d7 chip | #48484a★ |
| accent | #0066cc action blue | #2997ff sky link |
| accent-strong | #0066cc | #0071e3 focus blue（白字下 #2997ff 仅 3.0:1） |
| accent-fg | #ffffff | #ffffff |
| link | #0066cc | #2997ff |
| focus | #0071e3 | #2997ff |
| success / warning / danger / info | #248a3d★ / #b25000★ / #d70015★ / #0066cc（参考中没有语义色，取 Apple 系统色） | #30d158★ / #ff9f0a★ / #ff453a★ / #2997ff |
| tag-1…8 | Apple 系统色板★：#ff9500、#ff2d55、#34c759、#af52de、#007aff、#ffcc00、#5ac8fa、#a2845e | 对应的深色系统色★ |
| launchBackdrop | `#f5f5f7` | `#000000` |

### 6.3 Notion（中性暖灰、彩色属性）

- **字体**：
  - ui、display、label 为 `"Inter Variable", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif`（Notion Sans 基于 Inter）。
  - mono 为 `"JetBrains Mono Variable", ui-monospace, monospace`。
- **字体性格**：title 600 / -0.01em；bodyLeading 1.55；strong 500。
- **形状**：control 8 px（矩形按钮，DESIGN.md 明确“不用胶囊”），card 12 px，popover 8 px，badge 4 px（标签小片），buttonPrimary 8 px；没有按下变形。
- **层级**（DESIGN.md 中的五级阴影）：card 为 `rgba(15,15,15,.04) 0 1px 2px`；popover 为 `rgba(15,15,15,.16) 0 16px 48px -8px`；dialog 同 popover。
- **彩色属性**：tag 色板直接取 DESIGN.md 的品牌色谱，`-bg` 取 card-tint 系列（通过 overrides 指定）。

| 核心色 | 浅色 | 深色 |
| --- | --- | --- |
| bg | #ffffff canvas | #1a1a1a ink |
| sidebar | #f6f5f4 surface | #202020★ |
| chrome | #ffffff | #1a1a1a |
| panel | #ffffff | #202020★ |
| elevated | #ffffff | #252525★ |
| muted-bg | #f0eeec card-tint-gray | #37352f charcoal |
| text | #1a1a1a ink | #ffffff on-dark |
| muted | #5d5b54 slate | #a4a097 on-dark-muted |
| faint | #787671 steel | #787671 |
| line | #e5e3df hairline | #2f2f2f★ |
| line-strong | #c8c4be hairline-strong | #5d5b54 slate |
| accent | #5645d4 purple | #7b3ff2 brand-purple |
| accent-strong | #5645d4 | #5645d4 |
| accent-fg | #ffffff | #ffffff |
| link | #0075de link-blue | #529cca★（#0075de 在深底上只有 3.6:1） |
| focus | #5645d4 | #7b3ff2 |
| success / warning / danger / info | #1aae39 / #dd5b00 / #e03131 / #0075de | 同左 |
| tag-1…8 | #dd5b00、#ff64c8、#1aae39、#7b3ff2、#0075de、#f5d75e、#2a9d99、#523410 | 同左 |
| tag-n-bg（浅色 overrides） | #ffe8d4、#fde0ec、#d9f3e1、#e6e0f5、#dcecfa、#fef7d6、#d9f3e1★、#f8f5e8 | 按派生规则 |
| launchBackdrop | `#ffffff` | `#0a1530` brand-navy |

### 6.4 Vercel（黑白分明、工程感）

- **字体**：
  - ui、display 为 `"Geist Variable", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif`。
  - mono 与 **label** 为 `"Geist Mono Variable", ui-monospace, monospace`（分区小标题、元信息标签使用等宽字体，这是 DESIGN.md 的标志做法）。
- **字体性格**：title 600 / -0.04em（激进的负字距）；bodyLeading 1.5；strong 500；label 不转大写。
- **形状**：control 6 px（`--geist-radius`），card 8 px，popover 8 px，badge 9999 px，buttonPrimary 6 px（工作台内使用 6 px 方形，DESIGN.md 规定同一屏幕不要混用 100 px 胶囊）；没有按下变形。
- **层级**（叠层阴影加内描边）：card 为 `0 0 0 1px #00000014, 0 1px 1px #00000005, 0 2px 2px #0000000a`；popover / dialog 为 Level 5 `0 0 0 1px #00000014, 0 1px 1px #00000005, 0 8px 16px -4px #0000000a, 0 24px 32px -8px #0000000f`。深色模式把描边换成 `#ffffff1a`★。
- **主按钮**：浅色模式为墨黑底白字，深色模式反转为近白底黑字（DESIGN.md 中的极性翻转）。

| 核心色 | 浅色 | 深色 |
| --- | --- | --- |
| bg | #fafafa canvas-soft | #0a0a0a★ |
| sidebar | #fafafa | #0a0a0a★ |
| chrome | #ffffff canvas | #0a0a0a★ |
| panel | #ffffff | #171717 |
| elevated | #ffffff | #171717 |
| muted-bg | #f5f5f5 canvas-soft-2 | #1f1f1f★ |
| text | #171717 ink | #ededed★ |
| muted | #4d4d4d body | #a1a1a1 |
| faint | #888888 mute | #888888 |
| line | #ebebeb hairline | #2e2e2e★ |
| line-strong | #a1a1a1 | #454545★ |
| accent | #171717 | #ededed★ |
| accent-strong | #171717 | #ededed★ |
| accent-fg | #ffffff | #0a0a0a★ |
| link | #0761d1 link-deep（#0070f3 在 #fafafa 上只有 4.36:1） | #3291ff★ |
| focus | #0070f3 | #3291ff★ |
| success / warning / danger / info | #29bc9b cyan-deep / #f5a623 / #ee0000 / #0070f3 | #50e3c2 cyan / #f5a623 / #ff4d4d / #3291ff★ |
| tag-1…8 | #f5a623、#ff0080、#29bc9b、#7928ca、#0070f3、#f9cb28、#50e3c2、#ab570a | 同左 |
| launchBackdrop | 网格渐变：`#007cf0`→`#00dfd8`、`#7928ca`→`#ff0080`、`#ff4d4d`→`#f9cb28` 三组径向渐变叠加在 #fafafa 上，低透明度 | 同样三组渐变叠加在 #0a0a0a 上 |

## 7. 字体

- **改用 Fontsource 包**（OFL 1.1，npm 发布，复用优先第 ③ 项）：`@fontsource-variable/inter`、`newsreader`、`geist`、`geist-mono`、`jetbrains-mono`。2026-11-13 用 `npm view` 核实：五个包都存在，版本 5.3.0，许可 OFL-1.1。
  - 只取 latin 与 latin-ext 子集。实施时核对包内是否有按子集拆分的 CSS 入口；没有就自己写 `@font-face`，指向包内对应子集的 woff2 文件，避免默认入口把所有子集打进安装包。
  - Newsreader 核对是否需要 `opsz` 轴版本。
  - 中文全部使用系统字体，不随包附带 CJK 字体。
- 删除 `proto/fonts.css` 中 658 KB 的 base64 内嵌字体，以及 Outfit、Manrope、Instrument Serif、iA Writer Duo（新设计不使用）。**这样 [spec.md §3.3](spec.md) 中关于 iA Writer Duo RFN 的核查不再需要**，字体声明表相应缩减为上面 5 个字族。
- 字体许可声明仍由 `scripts/gen-notices.mjs` 的“随包字体”一节负责：版权行改为从各 Fontsource 包的 LICENSE 文件读取，不再手抄。`gen-notices.mjs:8` 的许可白名单 `ALLOWED` 中没有 `OFL-1.1`，要加进去，否则这些依赖会被判为不合规。

## 8. 样式架构

### 8.1 目标目录

```text
packages/ui/src/styles/
  index.css                 # 唯一入口；声明 @layer 顺序并导入下列文件
  themes.generated.css      # @layer theme（生成，勿手改）
  tokens.css                # @layer tokens：共享 token
  base.css                  # @layer base：重置、正文、标题、焦点环、滚动条、选区、减少动效
  components/*.css          # @layer components：每个共享组件一个文件
packages/workbench/src/**/*.css   # @layer shell：外壳、设置、启动页、插件中心等工作台界面
plugins/<id>/src/ui/<id>.css      # @layer modules：插件自己的模块样式，由插件 UI 入口导入
```

- `@layer vendor, theme, tokens, base, components, shell, modules;` 明确层叠顺序，不再依赖文件加载顺序和同名变量互相覆盖。
- **第三方样式一律放进 `vendor` 层**：sonner（现 `proto/index.css:28`）、xterm（`TerminalView.tsx:3`）、katex（`MarkdownPreview.tsx:1`）都改为在 `index.css` 中 `@import "…" layer(vendor)`，组件里不再单独导入。不分层的样式总会压过分层样式，不这样做的话，我们覆盖第三方的规则会全部失效。
- CodeMirror 运行时注入的样式无法分层，对它的覆盖只通过 `EditorView.theme` 写（§4.2）。
- 删除整个 `packages/ui/src/styles/proto/` 与 `components.css`。
- **类名规则**：共享组件统一使用 `hu-` 前缀（如 `hu-btn`、`hu-badge`、`hu-dialog`）；外壳使用 `shell-` 等工作台前缀；插件样式使用插件 id 前缀（如 `notes-`、`tasks-`、`agent-`）。同一概念只保留一个类名，例如删除 `.btn` 与 `.hu-btn` 并存的情况。
- **密度只用一套选择器**：`[data-density="compact"]`。删除没有设置点的 `data-compact` 死选择器（`proto/system.css:1367-1377`）。
- 插件样式只能使用公开 token 与共享组件类，不覆盖其他插件或外壳的类。

### 8.2 守护规则（CI 中执行，`pnpm lint` 的一部分）

| 规则 | 实现 |
| --- | --- |
| CSS 中不出现颜色字面量（生成文件除外） | stylelint：`color-no-hex`、`color-named: never`、`function-disallowed-list: [rgb, rgba, hsl, hsla, hwb, lab, lch, oklab, oklch, color-mix]`。`color-mix` 也禁止，因为它能绕过对比度测试；需要透明度时，在 §4.2 中增加派生 token。实施时实测 `color-named` 是否放过 `transparent`、`currentcolor` |
| 不引用未定义的变量 | `stylelint-value-no-unknown-custom-properties`，导入 tokens 与生成的主题文件作为已知集合 |
| 类名前缀 | stylelint `selector-class-pattern`，按目录分别配置；第三方类名 `.cm-*`、`.xterm*`、`.katex*` 与 `[data-sonner-*]` 放行 |
| 不出现重复选择器 / 重复属性 | stylelint `no-duplicate-selectors`、`declaration-block-no-duplicate-properties` |
| TSX / TS 中不出现颜色字面量 | `scripts/check-ui-colors.mjs` 扫描 `packages/*/src`、`plugins/*/src`、`apps/desktop/src/renderer`，排除 `packages/ui/src/themes/`。思路借鉴 open-knowledge 的 `no-fixed-palette-color` |
| 主题生成文件没有漂移 | 单元测试 |
| 没有未使用的 CSS | DS-S4 用 PurgeCSS 生成 rejected 报告，逐条核查：确实没用的删除，动态拼接的类名写进 safelist 并注明出处；核查记录保存在 progress.md。之后由类名前缀规则与代码评审维持 |

检查脚本的排除表只有以下几项，每项都注明原因：
- `apps/desktop/src/main/index.ts`：错误页是主进程内联的 HTML，加载不到主题；另有窗口首帧底色（§3.4）。
- `packages/editor/src/vendor/`：第三方代码。其中的 `#hex` 兜底值不改，但它的主题入口（`atomic-theme.ts`）读取的变量必须映射到公开 token。
- 第三方品牌图标组件（例如 agent-launch-settings 从 orca 复制的 Claude、Codex、Pi 图标）：品牌色属于图形本身。

## 9. 与品牌的衔接

- 顶栏、启动页、关于页的猫头使用 `huhu-mark-mono`，以 mask 加 `background-color: var(--text)` 着色，随主题变色（[spec.md §3.1](spec.md)）。
- logo 的明暗切换看 `[data-mode]`，与主题无关。
- 品牌色不进入主题：HUHU 没有自己的强调色，强调色由所选主题决定。

## 10. 验收

| 编号 | 动作 → 可观察结果 |
| --- | --- |
| DS-01 | 外观页显示 Claude、Apple、Notion、Vercel 四张预览卡，每张都按自身主题渲染（打开深色时预览卡显示深色）；没有 Pearl、SuliWorld、Soft |
| DS-02 | 逐一切换四套主题 × 浅色 / 深色，截图首页、笔记编辑器、任务看板、Agent CLI 终端、设置页、启动页、一个对话框和一个下拉菜单，共 8 张 × 8 组。每组都符合 §6 的标志特征：Claude 衬线标题与珊瑚按钮；Apple 胶囊主按钮与毛玻璃顶栏；Notion 紫色主按钮与彩色标签；Vercel 墨黑主按钮与等宽小标签 |
| DS-03 | `theme.test.ts`：四套主题 × 两种模式全部通过 §5 的对比度门槛；zod 校验通过；`THEME_IDS` 与 `THEMES` 一一对应 |
| DS-04 | 漂移测试：修改任一主题文件而不重新生成时测试失败；运行 `pnpm gen:themes` 后通过 |
| DS-05 | 测试夹具主题（extends notion，只改 accent）：生成的 CSS 与 notion 只有 accent 及其派生色不同，并且通过对比度门槛 |
| DS-06 | 选择跟随系统后切换操作系统的深浅色，应用无需重启即实时切换 |
| DS-07 | 设为 Vercel 深色后重启应用：窗口出现时就是 Vercel 深色，没有白闪；打开 Vault 后保持不变；`.huhu/settings.json` 中为 `"theme":"vercel"`。清空 localStorage 并把系统设为深色后启动：首帧为 Claude 深色 |
| DS-08 | 把 settings.json 中的 theme 改为 `"pearl"` → 应用按默认主题显示，不报错 |
| DS-09 | `pnpm lint` 中的 stylelint 与 `check-ui-colors` 通过；故意在任一插件 CSS 中写 `#fff`，或在 TSX 中写 `color: "red"`，lint 均失败 |
| DS-10 | `git ls-files packages/ui/src/styles/proto` 为空；`git grep -nE 'pearl|suliworld|Suliworld|data-compact|--v9-|iA Writer' -- ':!.agents/'` 为 0 |
| DS-11 | PurgeCSS 的 rejected 报告已逐条核查，safelist 每一项都有出处记录 |
| DS-12 | 终端：切换主题后，xterm 的背景、前景、ANSI 颜色随之改变，不需要重开会话；在浅色主题下运行 `printf '\e[37mwhite\e[0m'`，文字可读。Mermaid 图在切换明暗后重新渲染 |
| DS-13 | 设置 compact 密度后，控件高度和行高收紧；e2e `shell.spec.ts` 中的密度用例通过 |
| DS-14 | 减少动效（设置或系统偏好）时，没有过渡动画；Apple 主题的按下缩放也关闭 |
| DS-15 | 现有 e2e 全部通过（主题相关用例改为新的主题 id 与 testid） |

## 11. 已作出的取舍

| 编号 | 决定 | 理由 |
| --- | --- | --- |
| DS-D1 | 主题用 TS 数据定义，构建期生成静态 CSS 并提交；运行时的自定义主题复用同一个生成函数 | 静态 CSS 首帧可用、没有闪烁、可以审查差异；数据形式让新增主题和自定义主题都不需要改样式。备选方案是运行时注入全部主题，但首帧要等 JS，测试也只能测运行时 |
| DS-D2 | 派生色在生成期用 culori 计算成具体值，CSS 中不使用 `color-mix()` | 对比度测试可以直接断言最终值；Chromium 虽然支持 `color-mix()`，但测试无法覆盖浏览器的计算结果 |
| DS-D3 | 主题选择器不绑定 `:root` | 预览卡等局部区域可以套用任一主题，不必另写一套预览样式 |
| DS-D4 | 保留现有短 token 名，删除所有别名 | 约 2,300 处引用不必大规模改名；删除别名后每个概念只剩一个名字 |
| DS-D5 | 参考值与可访问性冲突时，可访问性优先，替代值仍取自同一份 DESIGN.md | 工作台的正文和按钮文字必须可读；营销页可以接受的 3:1 在工作台不可接受 |
| DS-D6 | 中文使用系统字体，衬线标题的中文回退到无衬线 | CJK 字体动辄 10 MB 以上；Windows 系统衬线中文只有宋体，与任何一套主题都不协调 |
| DS-D7 | 模块样式随插件走（`plugins/<id>/src/ui/*.css`） | 与“插件独立”的架构一致：样式归属清楚，删除插件时样式一并删除。备选方案是继续集中在 `packages/ui`，但那样 ui 包会认识所有业务模块 |
| DS-D8 | 引入 stylelint 及一个未知变量插件 | 现有 oxlint 不检查 CSS；手写检查脚本覆盖不了重复选择器、类名前缀等规则 |
| DS-D9 | 首帧外观缓存在 localStorage | 启动页没有 Vault，读不到设置；这里只是显示缓存，不是应用级设置存储，D-26 不变 |
