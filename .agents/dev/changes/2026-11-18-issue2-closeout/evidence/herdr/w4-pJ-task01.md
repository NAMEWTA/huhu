# task01 · H02：OK Tailwind 与 Huhu 类名交集（A/B）清零或逐项登记，并让守护可执行

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-css`，分支 `closeout/issue2-css`（= 3dbd420，依赖已装，未构建）。

## 依据（必读）
- 规格 H02（归档 `.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:83`）：`check-ok-class-collisions` 为**空交集**；非知识库界面计算样式 / 像素 0 差异（已批准预期变化除外并登记）。决定 OP-D05（`decisions.md` 约 40–60 行）：变量与 base 收进 `.ok-root`，utilities 在 `vendor.ok-utilities` 子层。
- 独立审查 `w4:pE/report06.md`「H02 · 主题值与构建守护」与「分级」：当前 `host-fetch` A/B = 10/12、`rich` = 13/0（main 9f870c0 相同，即 OK 移植起就存在）；实例：`vendor.ok-utilities` 中未限定的 `.text-link{color:var(--link-color)}` 会命中 OK 根外启动页 `packages/workbench/src/launch/LaunchPage.tsx:150` 的按钮。守护漏检：`:where(:root)`、`.ok-root + .host`、`:is(html,.ok-root)`、按 `rich-` 名称筛块、`::backdrop` 整条放行。

## 要求
1. 列出 `pnpm build` 后 `host-fetch-*.css` 与 `rich-*.css` 的全部 A/B 项（`node scripts/check-ok-class-collisions.mjs <css>`）。对每一项：找出 Huhu 使用位置（TSX/HTML/CSS），判定该 OK 规则能否作用到 `.ok-root` 之外的 Huhu 元素，并在真实 Electron 中测量相关非知识库元素的计算样式（与 rc.4 `/home/wta/projects/huhu-wt-rc4` 或修复前对比）。
2. 修复真实泄漏：优先让 OK 的 utilities / 组件规则只在 `.ok-root` 作用域内生效（复用现有 Tailwind 作用域 PostCSS 插件或 Tailwind 的 `important`/selector 策略，评估对 portal 的影响——OK 的 portal 容器按 OP-D05 都挂 `.ok-root`），或改 Huhu 一侧的类名。不得改变 OK 区域内渲染。
3. 无害项（例如 Huhu 有意在 `.ok-root` 容器上使用的 `ok-root` 本身、只出现在 OK 根内部的宿主组件）在检查脚本中以**精确类名 + 理由**登记为允许项；A/B 未登记即退出非 0（与 C 同样阻断构建）。
4. 收紧 C 类判定（report06 应修）：用选择器 AST 判定每个选择器分支目标是否在 `.ok-root` 内（覆盖 `:where/:is` 内的全局、`.ok-root` 后的兄弟组合子、无 `.ok-root` 标记的独立 OK 块——用构建来源或 OK 输出标记识别产物，不按文件名猜），`::backdrop` 例外只放行登记的 `--tw-*` 默认声明。为每个漏检分支加负例测试（新增单测，放 `scripts/` 旁或 `packages/*/test`）。
5. 验证：`pnpm build`（含新守护，先在 3dbd420 产物上判红再修绿）；`pnpm lint`、`typecheck`、`test`、`knip`、`format:check`；非知识库屏幕计算样式对照（启动页、工作台、任务、收件箱、设置至少各一屏，四主题明暗中至少 claude-light/dark）；e2e 零重试：`tests/e2e/shell.spec.ts`、`states.spec.ts`、`a11y.spec.ts`、`knowledge/theme-ok-tokens.spec.ts`、`knowledge/editor-s3-toolbar.spec.ts`、`knowledge/editor-parity-closeout.spec.ts`、`knowledge/comments-*.spec.ts`、`workflows/viewers.spec.ts`；若仓库有 `pnpm visual:compare` 流程且 rc4 基线可用，跑非知识库屏幕。
6. 负载纪律：w4:pD 同时在做 e2e 复现；每次 e2e 前确认没有其他 Electron/Playwright 进程，记录起止 uptime。前端改动按 AGENTS.md 先走 zh-modern-web-guidance。
写入范围：`scripts/check-ok-class-collisions.mjs` 及其测试、Tailwind 作用域插件 / OK CSS 入口（`packages/editor/src/ok/` 下）、必要时 Huhu 侧使用冲突类名的组件与其 CSS、`package.json` scripts。vendor 文件若需改，须登记 `PATCHES.md` 并 `--refresh-replay`。其他先说明。
回报 `report01.md`（逐项表：类名、类别、使用位置、是否泄漏、处理、证据），manifest 中 w4:pJ 改为 done。
