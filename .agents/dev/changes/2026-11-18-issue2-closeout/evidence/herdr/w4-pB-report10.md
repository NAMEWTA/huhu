# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pB
- task：task10.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task10.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report10.md
- 执行结果：done

## 结论

三个 `--huhu-ok-*` 变量已迁入 Huhu 的全局 `tokens` 层。在主题根解析 `--muted`、`--accent` 和 `--syntax-type`，供 OK 子树继承。这样 OK 子树重新定义同名主题变量时，捕获值仍来自 Huhu 的主题根。四主题明暗八组的 HTML 根、OK 根和 CodeMirror 计算值逐项与修复前一致。

新增 `pnpm check:ok-css`。根 `pnpm build` 在各包构建结束后执行，因此现有 CI 和发布工作流的 `pnpm build` 都会检查新生成的 CSS。新守护在 `e85d281` 的产物上报告 `host-fetch` 的全局 `:root`，修复后 `host-fetch` 和 `rich` 的 C 类违规均为 0。A/B 继续按原脚本规则显示交集，`host-fetch` 为 10/12，`rich` 为 13/0，数量与基线相同。

## 产物与改动

- 工作目录 `/home/wta/projects/huhu-wt-layout`，分支 `closeout/issue2-layout`。开工快进到 `e85d2818e25373c16ad486f741f43fab100ad334`。任务提交 `ac6c8a57d697f91c895883a00e63a3cbc57d9efd`，提交后工作树干净。
- 修改 `packages/editor/src/rich/token-map.css`、`packages/ui/src/styles/tokens.css`、`scripts/check-ok-class-collisions.mjs`、根 `package.json`。生成主题文件和 CI 配置无需修改。
- 从产物发现含实际 OK 作用域选择器的 CSS，并纳入富文本惰性入口的 `rich-*.css`。仅在构建检查中，精确放行 `@layer vendor` 内原有 KaTeX 规则 `body{counter-reset:katexEqnNo mmlEqnNo}`，源码注释登记了 rc.4 与自动公式编号用途。原 C 类正则和单文件审计入口保持原样。若后续将 KaTeX CSS 作为独立的 vendor 入口输出，可分别核对第三方产物与 OK 产物，再移除混合块的例外。

## 验证

日志根目录 `/tmp/huhu-task10.CzdnGk`。基线构建 `e85d281`，最终构建 `ac6c8a5`，采集均使用 Linux 上的 Electron 44.9.1 / Chromium 152.0.7977.167。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 新守护先红 | `pnpm check:ok-css` 检查 `e85d281` 真实产物，`host-fetch` 的 `:root` 为 C=1，外层命令非零。`rich` 中与登记逐字相同的 KaTeX 规则获准。 | `baseline-build.log`、`baseline-guard.log` |
| 新守护转绿 | `pnpm build` 内置检查与独立 `pnpm check:ok-css` 均退出 0，两个编辑器相关块均为 C=0。 | `build.log`、`final-guard.log` |
| 守护边界 | 给 KaTeX 规则增加一个声明后，直接运行脚本报 `body` 并退出 1。只有全局 Huhu CSS、未找到 OK 块时退出 2。 | `tampered-guard.log`、`no-ok-guard.log` |
| 静态检查 | `pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`pnpm knip` 均退出 0。Knip 保留两个既有提示。 | `lint.log`、`typecheck.log`、`format-check.log`、`knip.log` |
| 指定 Electron E2E | `xvfb-run -a pnpm exec playwright test tests/e2e/knowledge/theme-ok-tokens.spec.ts tests/e2e/knowledge/editor-s3-toolbar.spec.ts tests/e2e/a11y.spec.ts tests/e2e/knowledge/i18n-zh-hans.spec.ts tests/e2e/knowledge/comments-edge-rail.spec.ts --retries=0`，24/24，2.8 分钟。F08 通过了八种主题模式、三个界面的剩余颜色为零断言，与 `evidence/layout/f08-computed-colors.json` 的 24 个样本审计结果相符。 | `e2e.log`、`e2e-pw/` |
| 三个变量计算值对照 | 用同一临时 Playwright 探针经设置 UI 切换真实主题，记录 HTML 根、OK 根和源码编辑器的计算值。八组数据逐项完全相同。还检查了三个捕获值均与 HTML 根上的各自源值相等。 | `computed.cjs`、`baseline-computed.json`、`final-computed.json`、`computed-diff.log` |

| 主题模式 | `--huhu-ok-muted-text` | `--huhu-ok-accent` | `--huhu-ok-syntax-type` |
| --- | --- | --- | --- |
| claude-light | `#62605a` | `#cc785c` | `#735c9d` |
| claude-dark | `#a09d96` | `#cc785c` | `#a28acf` |
| apple-light | `#626267` | `#0066cc` | `#8f49b4` |
| apple-dark | `#cccccc` | `#2997ff` | `#d088f8` |
| notion-light | `#5d5b54` | `#5645d4` | `#753ee6` |
| notion-dark | `#adaaa1` | `#7b3ff2` | `#9d82fb` |
| vercel-light | `#4d4d4d` | `#171717` | `#7928ca` |
| vercel-dark | `#a1a1a1` | `#ededed` | `#996ed9` |

## 阻碍与接续

无。归档中关于 `pnpm lint` 已包含这条守护的表述与现状有差异。本次的执行入口是根 `pnpm build`，归档文件未修改。

### Modern Web Guidance

- `css` 依照 “Use CSS custom properties on `:root` to define core design variables”，在宿主现有全局 token 层解析主题值，OK 组件继续使用继承值。用两次真实 Electron 构建逐项核对主题切换后的值。

## Lead 验收


Lead（2026-11-19）：接受。tokens.css 承接三项捕获，八组主题计算值一致；check:ok-css 先红后绿并接入 pnpm build；KaTeX 精确文本例外有理由登记。已 --no-ff 合入集成分支。
