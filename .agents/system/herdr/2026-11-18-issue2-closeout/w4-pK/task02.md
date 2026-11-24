# task02 · H02 严格口径与浮层子节点主题

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-css`，分支 `closeout3/h02`（= `closeout2/final` f9f0186，含你的 5074745）。提交，不推送。

依据：独立审查 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/reopened/independent-review.md` 第 1、2 条与「证据限制」H02 项；OP-D05（`decisions.md:55`）。

## 要求
1. **守护口径**：A 集合必须包含 Huhu 在 `components`/`shell`/`modules` 及其**所有子层**（含 `modules.huhu-ok`）中的 CSS。修正守护器后报告严格集合。
2. **消除严格交集**：评估把 Huhu 对 OK/第三方运行时类（ProseMirror、tiptap-editor、cm-*、ok-root 等）的映射规则放入 OK 输入层（`vendor.*` 下 Huhu 自建子层，排在 `vendor.ok-*` 之后）是否在层叠上可行且不改变任何计算样式（逐屏、四主题明暗计算样式零差异为证）；可行则迁移，守护器按来源层把它们算作 OK 侧并在报告中说明理由。**不得**用属性选择器、转义等方式躲避类名识别。不可行或仍有剩余项时，逐项给出证据，守护输出「待决」并保持非 0；由 Lead 交用户决定。
3. **浮层子节点**：气泡按钮提示（共享 Radix 容器 `app/src/lib/ok-portal.ts`）、快捷键标签 `components/ui/kbd.tsx`（产物中 `font-sans` 写死 Inter）、气泡自身圆角与阴影，按 OP-D05 映射宿主 token。四主题 × 明暗计算样式对照（覆盖这些子节点），截图为证。vendor 改动登记 PATCHES.md 并重放。
4. **rc.4 视觉对照**：当前候选对 rc.4 的非知识库屏幕计算样式与像素（`pnpm visual:compare rc4` 或项目现有流程，至少 claude 明暗，七屏），逐项列差异，并对照归档 `visual-compare-rc4.md` 中已批准的预期差异，标明哪些新出现、来源提交。
5. 验证（零重试）：`pnpm build`（含守护）、`lint`、`typecheck`、`test`、`test:vendor`、`knip`、`format:check`、`notices`、`ok-patches --check`、重放零差异；e2e：`shell`、`states`、`a11y`、`knowledge/theme-ok-tokens`、`knowledge/editor-s3-toolbar`、`knowledge/editor-parity-closeout*`、`knowledge/comments-*`、`workflows/viewers`。
负载纪律：w4:pG 在做启动测量，w4:pM 在跑 e2e；e2e 前确认无其他 Electron/Playwright 并记录 uptime。前端改动按 AGENTS.md 走 zh-modern-web-guidance。
回报 report02.md，manifest 中 w4:pK 改为 task02.md done。
