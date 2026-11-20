# F08 OK 主题映射

主题映射位于 `packages/ui/src/styles/ok-token-map.css`，由共享样式入口加载在 `modules` 层。编辑器、批注、文件树和 portal 各有 OK 根。每个根的 shadcn 颜色角色、侧栏、语法、代码块、查找、差异、批注、提示框、图表和 ANSI 颜色引用 Huhu 语义 token。Huhu 的 `--muted` 是次要文字色，OK 的同名变量是底色。宿主 token 层提供单独的文字色别名，以保持这两种用途。文件树的默认浅色选中颜色在 OK vendor 规则中带 `!important`，因此 Huhu 的对应覆盖位于优先级更早的 token 层。

扫描命令为 `xvfb-run -a pnpm e2e tests/e2e/knowledge/theme-ok-tokens.spec.ts`。它通过真实设置页选择四套主题各自的明暗模式，并启用紧凑显示、减少动效。逐个检查 OK 根和属性面板中的可见元素，进入文件树的开放 Shadow DOM，遍历正文、属性、批注输入、树和右键菜单。颜色值转换为同一 sRGB RGBA 表示后与当前主题的计算 token 对照，包含有内容的 `::before`、`::after` 和输入框的 `::placeholder`。逐属性记录未知颜色、元素例子和次数。透明和显式由主题 token 派生的半透明颜色另有解释。

Electron 44.9.1 捆绑 Chromium 152.0.7977.167。独立 Chromium 158 样式探针核对了八组主题作用域、文件树选中颜色及 240 / 720 px 容器的编辑模式收纳。该探针用最小 HTML 验证共享 CSS。仓库的完整工作台入口依赖 Electron preload，因此完整交互证据来自桌面入口。[浏览器样式输出](browser-css-smoke.txt)

最终扫描（34e7547 桌面构建，19a0ef0 采样器）8/8 组通过。每组属性页扫描 127 个元素、批注页 129 个、右键菜单态 172 个。24 个屏幕均无未解释的稳定颜色。树箭头和图标以 `--text` 的 80% 透明混合渲染，批注使用 `--muted` 的 5% 和 60% 透明混合。每项由扫描器按当前主题实时计算，详见 [完整计算样式记录](f08-computed-colors.json)。转场中曾看到的 Options 图标中间色来自 Shadow DOM 里既有的 120 ms 颜色过渡，采样等待该过渡完成。详情抽屉在减少动效设置下的实际 `animation-name` 为 `none`。

| 主题 | 浅色 | 深色 |
| --- | --- | --- |
| Claude | [截图](shots/f08-claude-light.png) | [截图](shots/f08-claude-dark.png) |
| Apple | [截图](shots/f08-apple-light.png) | [截图](shots/f08-apple-dark.png) |
| Notion | [截图](shots/f08-notion-light.png) | [截图](shots/f08-notion-dark.png) |
| Vercel | [截图](shots/f08-vercel-light.png) | [截图](shots/f08-vercel-dark.png) |
