# task01 · H02 按规格原文：空交集；以及 report07 的样式应修项

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-css`，分支 `closeout2/h02`（= main f16f614，依赖已装）。完成后在该分支提交，不推送。

## 依据（必读）
- 规格 H02（`.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:83`）原文：`check-ok-class-collisions` **为空交集**。三类定义见 `decisions.md` OP-D05「守护」：(a) Tailwind 产出的类名 ∩ Huhu CSS（**components/shell/modules 层**）类名；(b) Tailwind 产出的类名 ∩ Huhu TSX/HTML 里出现但没有 CSS 规则的类 token；(c) `.ok-root` 之外出现 OK 的变量名。
- 现状：`pnpm check:ok-css` 报 A=10（ProseMirror、cm-content、cm-editor、cm-searchMatch、cm-searchMatch-selected、cm-selectionLayer、cm-selectionMatch、grow、is-active、tiptap-editor）、B=12（border-t、flex、flex-1、flex-col、h-full、min-h-0、ok-root、overflow-y-auto、p-2、text-link、text-muted-foreground、text-xs），均以「登记」放行。逐项来源见 `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/herdr/w4-pJ-report01.md`。独立审查 `evidence/herdr/w4-pE-report07.md`「H02」与「分级」。

## 要求
1. **严格按 OP-D05 定义计算 A/B**（A 只与 Huhu 在 components/shell/modules 层的 CSS 求交；B 只取 Huhu TSX/HTML 中无任何 Huhu CSS 规则的 token），先报告严格口径下的实际集合，与现脚本口径的差别及理由。
2. 把能由 Huhu 一侧消除的交集全部消除，**不靠登记**：Huhu 自有类名改名（如 `grow`、`is-active`、`text-link`），宿主 `rich/comments.tsx` 等处使用的 Tailwind 工具类改为 Huhu 自有语义类与 CSS（按 Huhu 设计系统与层规则，`check-css-*` 仍须通过），Huhu 对 OK/第三方运行时类（ProseMirror、tiptap-editor、cm-*）的定制若可改为通过 Huhu 自有包装类 / 由 OK 侧 token 映射文件（属 OK 输入的 `vendor.*`/`*.huhu-ok` 层）承担，则迁移。**不得**用属性选择器、转义等方式绕过检查器的类名识别。
3. 若严格口径下仍有无法消除的交集（例如第三方库运行时生成、两侧都必须直接定制的类名），逐项给出不可消除的证据，作为待用户决定项，不要登记放行；脚本对这些项输出明确的「待决」提示（退出码保持非 0 直到 Lead 决定，可用环境变量或独立白名单文件由 Lead 控制，默认阻断）。
4. report07 应修：①`packages/editor/build/ok-scope-plugin.mjs` 以伪元素开头的逗号成员插入位置的空格问题（自身是 `.ok-root` 的 dialog 的 `::backdrop` 要命中），补产物断言；②新挂 `.ok-root` 的浮层（气泡、lint 提示、路径/命令候选、拖拽预览、图片缩放）按 OP-D05 使用宿主字体 token，四主题明暗下字族与修复前继承宿主时一致（Electron 计算样式对照，至少 vercel 与 claude）；③深色图片缩放遮罩：Huhu 用 `data-mode="dark"`，原规则依赖 `.dark` 祖先，验证展开后的 overlay 实际样式，必要时按 OP-D05 第 3 条改写 dark 变体，截图+计算样式为证。
5. 验证（零重试）：`pnpm build`（含守护）、`lint`、`typecheck`、`test`、`test:vendor`、`knip`、`format:check`、`notices`、`ok-patches --check`、`--refresh-replay` 后 `--replay` 零差异（vendor 改动登记 PATCHES.md）；守护负例测试；非知识库七屏 × claude 明暗计算样式与 main 零差异；e2e：`shell.spec.ts`、`states.spec.ts`、`a11y.spec.ts`、`knowledge/theme-ok-tokens.spec.ts`、`knowledge/editor-s3-toolbar.spec.ts`、`knowledge/editor-parity-closeout*.spec.ts`、`knowledge/comments-*.spec.ts`、`workflows/viewers.spec.ts`、`knowledge/attachments.spec.ts`。
6. 负载纪律：w4:pM、w4:pN 同时工作；e2e 前确认无其他 Electron/Playwright，记录起止 uptime。前端改动按 AGENTS.md 先走 zh-modern-web-guidance。
写入范围：检查脚本及测试、`packages/editor/build/ok-scope-plugin.mjs`、`packages/editor/src/ok/`、`packages/editor/src/rich/`（含 token-map.css、comments.tsx、OkRoot）、`packages/editor/src/editor.css`、`packages/ui/src/styles/`、`packages/workbench/src/launch/`、使用被改名类的宿主组件与其 CSS、必要的 vendor 文件（登记）。其他先说明。
回报 `report01.md`，在 manifest 中把 w4:pK 改为 done。
