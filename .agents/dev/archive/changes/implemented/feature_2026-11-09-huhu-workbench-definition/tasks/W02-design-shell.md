# W02 设计系统与工作台外壳

## W02.1 Token、主题与字体

- 目标：六种主题组合可切换，所有组件只通过语义变量取色。
- 依据：[design-system](../design-system.md) §2；ACC-SY-05（主题部分）。
- 前置：W01.2。
- 位置：`packages/ui/src/styles/{tokens.css,shadcn.css,fonts.css,motion.css}`、`packages/ui/src/theme.ts`。
- 复用：R-13、R-14；Geist 字体文件取自原型 `vendor/fonts.css` 引用的字体资源。
- 实现要点：Tailwind 4 `@theme` 引用 CSS 变量；`data-theme`/`data-mode` 写在 `<html>`；`mode: system` 跟随 `prefers-color-scheme`；motion token 与减少动态效果（`data-motion="reduced"` 与 `prefers-reduced-motion`）。
- 异常：设置值非法时回退 Pearl 浅色。
- 测试：组件测试遍历六种组合截图对比（Playwright 截图比较，阈值 0.1%）；axe 对比度检查（design-system §2.1 要求）。
- 完成：Foundations 预览页（`/dev/foundations`，仅开发构建可见）展示颜色、字号、间距、圆角，六组合对比度达标。

## W02.2 基础组件

- 目标：design-system §4 中通用组件全部可用并覆盖其状态。
- 依据：design-system §4、§5。
- 前置：W02.1。
- 位置：`packages/ui/src/components/`（button、input、textarea、select、combobox、checkbox、completion-circle、switch、segmented、badge、tooltip、popover、dropdown-menu、context-menu、dialog、alert-dialog、sheet、toast、banner、empty-state、skeleton、spinner、kbd、resizable）。
- 复用：R-13（shadcn CLI 生成后改 token）。
- 实现要点：Button loading 时禁止重复触发；CompletionCircle 支持乐观切换与失败回滚的受控属性；Banner、EmptyState 按规范自建；Dialog 提交中禁用外点关闭。
- 异常：无。
- 测试：每个组件的状态组件测试（hover/focus/disabled/loading/invalid）与键盘交互测试。
- 完成：Storybook 不引入；在 `/dev/components` 预览页逐一展示全部状态。

## W02.3 外壳布局

- 目标：顶栏、rail、标签条、路径栏、模块侧栏、内容区、详情面板、状态栏按规范渲染，可折叠、可拖动、响应式。
- 依据：design-system §3；ACC-WB-09。
- 前置：W02.2。
- 位置：`packages/workbench/src/shell/{AppShell,TopBar,Rail,ModuleTabs,PathBar,ModuleSidebar,DetailPanel,StatusBar}.tsx`、`packages/workbench/src/state/ui-store.ts`（zustand，按 vaultId 分片）。
- 复用：R-16（标签条）。
- 实现要点：贡献注册表 `packages/workbench/src/contributions.ts`（`modules`、`settingsPages`、`homeWidgets`、`commands`），插件 UI 以 `registerPlugin(contributions)` 接入；rail 按注册顺序与分组渲染；模块侧栏统一组件 `ModuleSidebar`（标题、计数、+、搜索、导航项、底部）；详情面板 < 1200px 变为 Sheet；专注模式；界面状态持久化到 `settings`（经 W03 能力，W03 前用内存）。
- 异常：贡献的模块组件抛错时用 ErrorBoundary 显示“这个模块出错了”+“重新加载模块”，不影响外壳。
- 测试：E2E 在 1440×900、1200×800、1024×768、960×600 截图；键盘 F6 区域循环；模块侧栏拖动宽度并重启后保持。
- 完成：用两个示例模块贡献演示全部外壳行为；ACC-WB-09 通过。

## W02.4 数据展示复合组件

- 目标：DataTable、Tree 包装、DateTimePicker 可供各模块使用。
- 依据：design-system §4。
- 前置：W02.2。
- 位置：`packages/ui/src/components/{data-table,date-time-picker,calendar}.tsx`。
- 复用：R-18；TanStack Table + react-virtual。
- 实现要点：DataTable 支持分组行（可折叠）、sticky 表头、列宽调整、键盘行导航、> 200 行虚拟化、隐藏列配置；DateTimePicker 支持日期/日期时间/时间三种模式与快捷按钮、直接输入、周起始参数、DateOnly 不转换时区。
- 异常：输入非法日期时就地错误且不提交。
- 测试：组件测试（键盘、分组折叠、日期输入解析含月末与闰年）。
- 完成：预览页展示 1,000 行虚拟表格与三种日期模式。

## W02.5 命令面板与快捷键

- 目标：`Mod+K` 命令面板与全局快捷键可用。
- 依据：design-system §5；[workbench](../modules/workbench.md) §2 命令面板；ACC-WB-07（搜索部分在 W04.5 后完成）。
- 前置：W02.3。
- 位置：`packages/workbench/src/command-palette/`、`packages/workbench/src/shortcuts.ts`。
- 复用：R-15。
- 实现要点：命令来源为贡献注册表；搜索来源接口 `SearchProvider`（W04.5 接 `vault.search`）；最近使用记录在界面状态；编辑器/终端聚焦与 IME 组合期间只保留 `Mod+K/S/W`。
- 异常：搜索请求过期（输入已变化）结果丢弃。
- 测试：组件测试分组与键盘；E2E 快捷键表逐项触发。
- 完成：全部快捷键行为与 design-system 表一致。
