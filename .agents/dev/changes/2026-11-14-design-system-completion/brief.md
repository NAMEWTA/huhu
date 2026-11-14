# 需求简报：设计系统收尾（样式架构、类名与分层）

## 来源

- 2026-11-14 用户要求：设计系统的剩余部分另开一个 change，激活相关 skills，把文档写完整。
- 上游 change：[品牌、设计系统与 Windows 安装](../2026-11-13-brand-and-windows-installer/README.md)。该 change 的 DS-S1（主题引擎与四套主题）已完成并验证；DS-S2～DS-S4 只完成了一部分，剩余项逐条列在它的 [progress.md](../2026-11-13-brand-and-windows-installer/progress.md)“未做”一节。本 change 接手这些剩余项，不重新讨论已定稿的主题数据、token 契约、字体与四套取值（仍以上游 [design-system.md](../2026-11-13-brand-and-windows-installer/design-system.md) §1～§7 为准）。
- 上游 [design-system.md §8](../2026-11-13-brand-and-windows-installer/design-system.md)“样式架构”与它的验收 DS-09～DS-11：本 change 重写 §8 的实施路径（原路径已被实践证伪，见下文），验收编号沿用。

## 问题

主题系统已经可用：四套主题 × 明暗、主题即数据、颜色只来自 token、lint 守护。但样式本身还停在“把原型样式拆开放好”的阶段：

1. **类名没有统一。** 约定是共享组件用 `hu-`、外壳用 `shell-`、插件用插件前缀；实际上 `shared.css` 里 721 个类名几乎都没有前缀（`knowledge-` 97 个、`execution-` 53 个、`tw-` 39 个、`btn`、`row`、`modal`……），只有 6 个以 `hu-` 开头。TSX 里还有 43 个类名在任何 CSS 里都没有定义（例如 23 处 `hu-meta`、`archive-undefined`），说明类名与样式已经脱节。
2. **样式不属于它的使用者。** `shared.css` 仍有 12,131 行 / 245 KB / 2,398 条规则，占全部界面样式的 85% 左右。按类名的实际使用者统计，其中约 156 个类只被 workbench 使用、47 个只被 notes 使用、42 个只被共享组件使用、其余分散在各插件。它们没有离开 `shared.css`，原因是迁移时必须保持层叠顺序：同一个类名被多个归属的规则共用时，搬动会改变谁覆盖谁。
3. **`@layer` 只是声明，没有生效。** `index.css` 声明了 `vendor, theme, tokens, base, components, shell, modules` 七层，但只有 tokens 与 base 两层有内容，其余样式都不在层里；而不分层的规则总是压过分层的规则。上一轮尝试一次性把样式分进各层，同一套 128 张截图比对出现了任务页、任务详情、笔记编辑器、档案视图、新建菜单的回归，已回退。本次文档阶段的静态核实发现一个很可能的根因：**CodeMirror 与 sonner 在运行时注入不分层样式**，而 `shared.css` 里约 124 处 `.cm-*`、12 处 `[data-sonner-*]` 是对它们的覆盖——这些规则一旦进层，就会输给运行时注入的样式。方案因此包含“不分层白名单”（见 spec §3.2），根因由 S1 实测确认。
4. **没有无用样式的证据。** 上一轮按“类名在源码里完全不出现”删了约 1,130 个死选择器，但没有用 PurgeCSS 或浏览器覆盖率交叉验证；动态拼接类名和悬停 / 焦点等状态只有静态证据。
5. **视觉回归手段不是仓库资产。** 上一轮靠临时脚本（`/tmp/ds/*`、已删除的 `_vis.spec.ts`）做 128 张截图像素比对。脚本不在仓库里，别人无法重复；截图也不覆盖悬停、焦点、禁用和窄窗口等状态，而这正是分层最容易改变的地方。
6. **DS-02 的完整验收没有做完。** 原验收要求 4 套主题 × 明暗 × 8 个界面共 64 组；上一轮只验证了部分主题。

## 目标（用一句话）

让每条样式规则属于唯一的使用者、以唯一的类名被引用，并由 `@layer` 的真实层序（而不是文件加载顺序）决定覆盖关系；同时留下一套能重复运行的“样式等价性”验证，使今后任何样式迁移都能证明没有改变外观。

## 范围

做：

- 把验证手段做成仓库资产：固定 Vault 的多状态截图、**计算样式快照比对**（主验证）、像素比对（辅助）、噪声基线。
- 类名治理：建立“类名 → 唯一归属”清单；清除未定义类名；按归属改名并同步改 TSX、CSS、e2e 选择器；用 stylelint 强制前缀。
- 样式归位：`shared.css` 只留共享组件与全局基础；其余按归属迁入 workbench / 各插件 / 编辑器。
- 真正的分层：所有项目样式进入 `components / shell / modules` 层，第三方样式进入 `vendor` 层；处理 `!important`、层序与特异性反转造成的差异。
- 无用样式核查：PurgeCSS 报告加浏览器 CSS 覆盖率，逐条核查，safelist 附出处。
- DS-02 完整验收（四套主题 × 明暗 × 8 个界面）与现行规范文档更新。

不做（非目标）：

- 不改主题数据、token 名、对比度门槛、字体；不新增主题。
- 不改任何界面的外观与交互。本 change 是**行为保持型重构**：每一步的验收是“渲染结果不变”，而不是“看起来差不多”。需要改外观的想法记为后续 change。
- 不引入 CSS Modules、Tailwind、vanilla-extract 等新的样式方案（见 spec 取舍 DC-D1）。
- 不处理 Windows 安装器、真实 CLI 验证等上游遗留项（它们与样式无关，仍留在上游 change）。
- 不提交、不推送、不发布 rc；按 CLAUDE.md，提交需要用户另行授权。

## 当前事实（观察于 2026-11-14，基线 HEAD `8283c5c` + 工作区未提交改动）

- 样式文件：`packages/ui/src/styles/{shared,base,tokens,index,themes.generated,fonts.generated}.css`；`packages/workbench/src/shell/shell.css`（250 行）；`packages/editor/src/editor.css`（29 行）；`plugins/{agent-cli,automations,inbox,notes,safe,ssh,tasks,versioning}/src/ui/<id>.css`（合计约 2,250 行）。
- `shared.css` 无 `@layer`；`!important` 共 62 处（界面范围合计 73：shared 62、base 4、agent-cli 2、versioning 2、notes / ssh / tasks 各 1）。
- `index.css`：`vendor`、`theme`、`tokens`、`base`、`components`、`shell`、`modules` 已声明；`fonts.generated.css`、`sonner/dist/styles.css`、`shared.css` 以普通导入加入（不在层里；`themes.generated.css` 自带 `@layer theme`）。xterm 与 katex 样式在各自组件里导入。
- 插件 CSS 由各插件 `src/ui/index.tsx` 导入；外壳 CSS 由 `apps/desktop/src/renderer/main.tsx` 导入（`@huhu/ui/styles.css` 之后）。
- 类名：`shared.css` 中 721 个不同类名，`hu-` 开头 6 个；在 3 个以上规则块出现的类名 354 个（`page-head` 95 次、`row` 95、`btn` 93）。TSX 中 `className=` 约 1,249 处，含 `hu-` 的约 111 行，其中 `hu-meta`（23 处）等 5 个 `hu-` 类没有任何定义；全部 TSX 字面类名中有 43 个没有定义。
- 工具：已有 stylelint 16 与 `scripts/check-ui-colors.mjs`；没有 PurgeCSS；仓库里没有像素比对或 `toHaveScreenshot`；`tests/e2e/screenshots.spec.ts` 只在设置 `HUHU_SHOTS_DIR` 时输出 1440×900 / 1024×768 的模块截图，不做比对。
- e2e 里依赖 CSS 类名的定位器有 56 处，其中绝大多数是第三方类（`.cm-content`、`.xterm-*`），需要在改名清单里单独核对。

## 约束

- 沿用上游约束：颜色只来自 token；不留兼容层与旧代码；仓库保持干净；只做简体中文；0→1 项目，不为旧类名保留别名。
- CLAUDE.md：搜索交给 `search` / `grep` 子代理；测试、类型检查、lint 交给 `audit`（传快照 SHA）；方案敲定前、重复错误、宣布完成前咨询顾问；复用优先。
- 同一时间只运行一个 Electron 实例（单实例锁）：验证脚本与 e2e 不能并行。
- 与其他 change 的共享文件：本 change 改写样式与类名，会触碰所有插件的 TSX。其他 change 仍在改同一批文件时，先合入其他 change，或在 plan 的“写入边界”中约定冻结窗口。

## 待决问题

无阻塞实施的产品决定（本 change 不改外观）。技术假设与核实办法见 [spec.md](spec.md)“待决问题”。
