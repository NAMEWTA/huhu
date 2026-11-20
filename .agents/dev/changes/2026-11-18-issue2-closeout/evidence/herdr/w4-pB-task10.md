# task10 · H02 守护：OK 样式块中的全局 `:root` 自定义属性

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-layout`，分支 `closeout/issue2-layout`。开始前 `git merge --ff-only closeout/issue2-integration`（应快进到 e85d281）。

## 现象（Lead 在 e85d281 构建上实测）
`node scripts/check-ok-class-collisions.mjs apps/desktop/out/renderer/assets/host-fetch-*.css` → C 类 1：`:root`（退出非 0）。
来源：`packages/editor/src/rich/token-map.css` 的 `@layer tokens { :root { --huhu-ok-muted-text …; --huhu-ok-accent …; --huhu-ok-syntax-type … } }`，由你在 `6f1023c` 引入。main `9f870c0` 的同名块 C=0，因此是本次收尾引入的 H02 守护回归（spec H02：`check-ok-class-collisions` 为空交集；C 类 = `.ok-root` 之外不得声明自定义属性、不得选中 html/body/:root）。
另：`rich-*.css` 中 KaTeX 的 `body{counter-reset:katexEqnNo mmlEqnNo}` 与 main 字节相同、rc.4 已有，属第三方既有规则，Lead 登记，不在本任务修复范围（如你能低成本把 KaTeX 样式与 OK 样式分开检查，可在报告中提出，不要实施）。
另：归档 verification.md 声称 `pnpm lint` 含该检查，实际没有，所以回归未被拦住。

## 要求
1. 把这三个 `--huhu-ok-*` 捕获移到 Huhu 自有的全局 token 层（`packages/ui/src/styles/tokens.css` 或主题生成源中最合适的位置，注意 `themes.generated.css` 是生成文件，若需改生成源请改源头并重新生成），保持值在 OK 作用域重定义 `--muted`/`--accent` 之前解析的语义。不得用 `:where(:root)` 一类写法绕过守护的正则。
2. 增加可执行守护：新增 package script（例如 `pnpm check:ok-css`），在 `pnpm build` 之后对 `apps/desktop/out/renderer/assets/` 中包含 OK 作用域（`ok-root`）的 Tailwind 产出块运行 `check-ok-class-collisions`；对 KaTeX 等第三方既有全局规则，只允许在脚本中以**精确规则文本 + 注释理由**登记（不放宽通用正则），并让 e85d281 上的 `:root` 违规在修复前能被它拦住（先红后绿）。把它接入现有门禁中合适的位置（例如 `pnpm build` 后的检查或 CI 工作流），在报告说明。
3. 验证：`pnpm build` 后新守护通过；`pnpm lint`、`typecheck`、`format:check`、`knip`；e2e 零重试：`tests/e2e/knowledge/theme-ok-tokens.spec.ts`、`editor-s3-toolbar.spec.ts`、`a11y.spec.ts`、`i18n-zh-hans.spec.ts`、`comments-edge-rail.spec.ts`。核对四套主题明暗下 `--huhu-ok-*` 计算值与修复前一致（可用 F08 现有的 computed-colors 采集方式，对比 `evidence/layout/f08-computed-colors.json`）。
4. 写入范围：`packages/editor/src/rich/token-map.css`、Huhu token CSS（或其生成源及生成物）、`scripts/check-ok-class-collisions.mjs` 或新增检查脚本、`package.json` scripts、CI 配置（如接入）。其他文件先说明。前端改动按 AGENTS.md 走 zh-modern-web-guidance。
回报 `report10.md`，manifest 中 w4:pB 改为 done。
