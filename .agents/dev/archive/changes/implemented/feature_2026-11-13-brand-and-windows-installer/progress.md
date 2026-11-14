# 进度：品牌、设计系统与 Windows 安装器

## 已完成并验证

- BR-S1：`assets/brand/`、窗口与打包图标、顶栏 / 启动页 / 关于页品牌位。发现并修复：`mask-image` 引用本地文件在 `file://` 页面里被跨源拒绝（会变成实心色块），改为 `<img>` + 深色反相。证据：启动页截图、e2e shell。
- BR-S2：`electron-builder.yml` 的 NSIS 向导式配置（范围 / 目录可选）。**安装器交互未经 Windows 实机验证。**
- DS-S1：四套主题（Claude / Apple / Notion / Vercel）× 明暗，主题即数据（`packages/ui/src/themes`），OKLab 生成器、`themes.generated.css`（漂移测试）、`AppearanceController`、Fontsource 字体、xterm 跟随主题。表驱动对比度测试：正文 ≥ 7、次要文字（含 faint）≥ 4.5，覆盖 bg / panel / sidebar / muted-bg。axe e2e 通过。
- DS-S2 的一部分：
  - 全部 proto CSS 与 components / base 里的硬编码颜色（约 230 处）按“最接近的语义 token”换成 token（深色规则按深色调色板匹配）；新增 `--shadow-ink`、`--on-solid`。**这是自动映射，没有逐屏人工核对**；Claude 主题下的任务 / 知识库 / 启动页截图看过。
  - stylelint（`.stylelintrc.json`：禁十六进制、颜色函数与颜色名）与 `scripts/check-ui-colors.mjs` 已接入 `pnpm lint`。
  - 删除了旧的档案样式。

## 样式拆分（DS-S2～S4 的完成部分）

- `packages/ui/src/styles/proto/`（21 个原型样式文件）与 `components.css` 已删除，`proto.css` 导出不存在；`packages/ui/src/proto/` 下的三个 TS 组件已并入 `components/`。
- 规则按“类名实际被哪个包使用”拆分：共享样式在 `packages/ui/src/styles/shared.css`；各插件有自己的 `src/ui/<id>.css`（agent-cli、automations、inbox、notes、safe、ssh、tasks、versioning），编辑器有 `packages/editor/src/editor.css`。
- 为保证层叠结果不变，**只有顺序上安全的规则才会离开共享样式**：如果某条规则后面还有“别的归属”的规则与它共用类名，或有元素 / 属性选择器（如 `input[type=checkbox]`）可能覆盖它，就留在共享样式里保持原顺序（474 条）。结果：约 85% 的规则仍在 `shared.css`，插件自己的 CSS 合计约 40 KB。
- 验证：固定 Vault、2 套主题 × 明暗 × 13 个模块 + 看板 / 月历 / 详情 / 新建对话框 / 笔记 / 档案三个视图 / 编辑字段对话框 / 规则编辑器 / 命令面板 / 设置 7 页 / 新建菜单，共 128 张截图，与迁移前逐像素比对：先用两次未改动的基线确认只有时间戳类噪声（33 张），迁移后差异的文件集合与该噪声一致，唯一多出的一张最大通道差为 1、没有超过 16 的像素。
- 过程中的教训：第一次拆分出现大面积差异，原因有三——把 sonner 放进 `@layer vendor`（降低了它的优先级）、先拆再依赖加载顺序（规则互相覆盖的顺序翻转）、新写的 `.archive-view h2` 泄漏到嵌套的对话框标题。

## 未做（如实说明）

> 以下 DS 剩余项（`hu-` 类名统一、按组件重写、真实 `@layer`、PurgeCSS、DS-02 完整验收）已转入 [2026-11-14-design-system-completion](../feature_2026-11-14-design-system-completion/README.md)，在那里实施与验证；本节保留作历史记录。

- 死规则已删除：类名在整个仓库源码（TS / TSX / HTML / e2e）里都没有出现过的约 1130 个选择器（库生成的类名 `cm-` / `xterm` / `katex` / `mermaid` / `sonner` 等按白名单保留）。验证同样是 128 张截图逐像素比对，重复跑两次：第一次 `版本历史` 页有差异，看图是“没有历史版本”的数据时序（不是样式），第二次与基线噪声完全一致。此前那次大面积差异的真正原因是 sonner 放进了 `@layer vendor` 与规则顺序翻转，不是删规则。
  - 没有运行 PurgeCSS 报告；动态拼接类名、悬停 / 焦点等没有出现在截图里的状态，只有静态证据（类名在源码里不存在）。
- `hu-` 类名统一、`components/<name>.css` 按组件重写共享样式、`@layer` 中 vendor / components / shell / modules 层的实际使用没有做（试过：把第三方样式放 vendor、共享样式放 components、外壳放 shell、插件与编辑器放 modules，同一套 128 张截图比对出现任务页、任务详情、笔记编辑器、档案视图、新建菜单的回归——分层会改变 `!important` 与未分层规则之间的优先级关系，需要逐条处理，已回退）；现行设计规范已写在 `.agents/dev/notes/context/design-system.md`。
- 按 plan，DS-S4 的这些项通过前不应发布 rc。
- 旧主题 id（pearl / suliworld / soft）不迁移（按“无兼容”）。
