# B01 与 H07 验证运行记录

运行目录为 `/home/wta/projects/huhu-wt-parity`，分支为 `closeout/issue2-parity`。桌面构建以 `e2141fa` 为应用源码依据，`25d69db` 只增测试。Electron 44.9.1 捆绑 Chromium 152.0.7977.167。桌面 E2E 采用真实 Playwright Electron 夹具。运行时设置 `HUHU_HERDR_BIN=/home/wta/projects/huhu/apps/desktop/resources/herdr/linux-x64/herdr-core`。

原始日志位于本机 `/tmp/huhu-parity-k9IJH3/`。表中退出码为 shell 实测。失败的 pnpm 包装命令返回 126，底层 Vitest 或 Playwright 报告失败。常规 E2E 仍按既有条件跳过大 Vault 用例，该用例另设开关单独运行。

## 交付候选

| 命令 | 退出码 | 用例计数 | 日志 |
| --- | ---: | --- | --- |
| `pnpm typecheck` | 0 | 无逐用例计数 | `typecheck-delivery.log` |
| `pnpm lint` | 0 | 无逐用例计数 | `lint-delivery.log` |
| `pnpm test` | 0 | Test Files  83 passed / 1 skipped (84)；Tests  859 passed / 1 skipped (860) | `test-delivery-retry.log` |
| `pnpm test:vendor` | 0 | Test Files  290 passed (290)；Tests  6009 passed / 4 skipped (6013) | `test-vendor-delivery.log` |
| `node scripts/ok-patches.mjs --check` | 0 | 无逐用例计数 | `patches-delivery.log` |
| `pnpm build` | 0 | 无逐用例计数 | `build-delivery.log` |
| `pnpm format:check` | 0 | 无逐用例计数 | `format-check-delivery.log` |
| `pnpm knip` | 0 | 无逐用例计数 | `knip-delivery.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 126 | 2 failed；1 skipped；46 passed (6.1m) | `e2e-delivery.log` |
| `HUHU_E2E_HUGE_VAULT=1 xvfb-run -a pnpm e2e tests/e2e/knowledge/huge-vault.spec.ts` | 0 | 1 passed (8.5s) | `huge-vault.log` |

## 失败、重跑与专项验证

| 命令 | 退出码 | 计数 | 实际结果 | 日志 |
| --- | ---: | --- | --- | --- |
| `pnpm test` | 0 | Test Files  80 passed / 2 skipped (82)；Tests  845 passed / 8 skipped (853) | 基线，默认环境 | `test.log` |
| `pnpm test:vendor` | 0 | Test Files  167 passed (167)；Tests  4173 passed / 2 skipped (4175) | 基线上游 suite | `test-vendor.log` |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts src/vendor/open-knowledge/app/src/editor src/vendor/open-knowledge/app/src/components` | 126 | Test Files  47 failed / 73 passed (120)；Tests  262 failed / 1276 passed (1538) | 首次迁入缺少上游英语宏替身 | `vendor-import-attempt.log` |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-app --outputFile.json /tmp/huhu-parity-k9IJH3/vendor-app.json` | 126 | Test Files  29 failed / 91 passed (120)；Tests  93 failed / 1445 passed (1538) | 改用上游宏替身，继续收敛缺夹具和宿主闭包的导出差异 | `vendor-import-shim.log` |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-app --outputFile.json /tmp/huhu-parity-k9IJH3/vendor-app-adapt.json` | 126 | Test Files  10 failed / 110 passed (120)；Tests  36 failed / 1750 passed (1786) | 迁入缺失夹具并指向宿主采用的源码 | `vendor-import-adapt.log` |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-app source-dirty-fold-atomicity` | 0 | Test Files  1 passed (1)；Tests  2 passed (2) | 显式使用宿主结算入口后，单事务一次与对照组两次都通过 | `vendor-fold.log` |
| `pnpm test:vendor` | 126 | Test Files  1 failed / 284 passed (285)；Tests  1 failed / 5958 passed / 4 skipped (5963) | 原有 y-prosemirror 依赖目录检查超 120 秒，Vitest 同时报告 RPC 超时 | `test-vendor-final.log` |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-node y-prosemirror-patch --maxWorkers=1` | 0 | Test Files  1 passed (1)；Tests  10 passed (10) | 超时用例单独重跑 1 | `y-prosemirror-1.log` |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-node y-prosemirror-patch --maxWorkers=1` | 0 | Test Files  1 passed (1)；Tests  10 passed (10) | 超时用例单独重跑 2 | `y-prosemirror-2.log` |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-node y-prosemirror-patch --maxWorkers=1` | 0 | Test Files  1 passed (1)；Tests  10 passed (10) | 超时用例单独重跑 3 | `y-prosemirror-3.log` |
| `pnpm test:vendor` | 126 | Test Files  1 failed / 288 passed (289)；Tests  1 failed / 6005 passed / 4 skipped (6010) | 新迁入 preview-iframe-theme 的纯 Node 用例在 jsdom 里看到浏览器根主题。按上游环境执行后通过 | `test-vendor-verified.log` |
| `pnpm test:vendor` | 0 | Test Files  289 passed (289)；Tests  6006 passed / 4 skipped (6010) | 主题消息的 Node 用例已恢复 | `test-vendor-corrected.log` |
| `pnpm test` | 126 | Test Files  1 failed / 82 passed / 1 skipped (84)；Tests  1 failed / 858 passed / 1 skipped (860) | 既有 Vault 监听用例读到了 self.md 的原子写临时名 | `test-delivery.log` |
| `pnpm exec vitest run packages/vault/test/watcher.test.ts -t '自写不回声'` | 0 | Test Files  1 passed (1)；Tests  1 passed / 5 skipped (6) | 监听偶发失败重跑 1 | `watcher-1.log` |
| `pnpm exec vitest run packages/vault/test/watcher.test.ts -t '自写不回声'` | 0 | Test Files  1 passed (1)；Tests  1 passed / 5 skipped (6) | 监听偶发失败重跑 2 | `watcher-2.log` |
| `pnpm exec vitest run packages/vault/test/watcher.test.ts -t '自写不回声'` | 0 | Test Files  1 passed (1)；Tests  1 passed / 5 skipped (6) | 监听偶发失败重跑 3 | `watcher-3.log` |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-app use-app-color-mode` | 126 | Test Files  1 failed (1)；Tests  2 failed (2) | 宿主主题优先级和切换回归在修复前失败 | `theme-red.log` |
| `pnpm --filter @huhu/editor exec vitest run -c vitest.vendor.config.ts --project ok-app use-app-color-mode` | 0 | Test Files  1 passed (1)；Tests  2 passed (2) | 修复后通过 | `theme-green.log` |
| `pnpm exec vitest run packages/editor/test/markdown-parity.test.ts packages/editor/test/plain-text-clipboard.test.ts` | 126 | Test Files  1 failed / 1 passed (2)；Tests  1 failed / 6 passed (7) | 多字节上限回归在修复前失败，纯文本剪贴板已通过 | `html-bytes-red.log` |
| `pnpm exec vitest run packages/editor/test/markdown-parity.test.ts packages/editor/test/plain-text-clipboard.test.ts` | 0 | Test Files  2 passed (2)；Tests  7 passed (7) | 多字节上限修复后通过 | `html-bytes-green.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/fidelity-local-edit.spec.ts` | 0 | 1 passed (18.0s) | 首次 H07 独立运行，完整缓冲字节比较通过 | `h07-first.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 126 | 2 failed；1 skipped；32 passed (10.0m) | 基线 H07 在 200% 残留缩放下文件树点击被底栏拦截。既有 journey 切换到冷笔记未成功 | `e2e.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/fidelity-local-edit.spec.ts --repeat-each=3` | 0 | 3 passed (38.3s) | H07 恢复固定窗口尺寸与缩放后的三次重跑 | `h07-3.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/journey.spec.ts --repeat-each=3` | 126 | 3 failed | 既有旅程重跑：两次 TXT 未落盘，一次切回笔记后的文本未落盘。后续全量已有真实通过结果 | `journey-3.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts tests/e2e/knowledge/fidelity-local-edit.spec.ts` | 126 | 4 failed；2 passed (1.6m) | 首次专项复现标签路由未接、若干测试夹具假设错误 | `e2e-targeted.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts tests/e2e/knowledge/fidelity-local-edit.spec.ts` | 126 | 6 failed；1 passed (1.5m) | 尝试从 Vault barrel 复用链接解析，引入 Node 依赖导致 renderer 的 process is not defined，已改回编辑器 MarkdownManager | `e2e-targeted-2.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts tests/e2e/knowledge/fidelity-local-edit.spec.ts` | 126 | 2 failed；6 passed (1.0m) | 查找替换、候选、表格、剪贴板和 H07 均通过；修正 HTML 显示形态和关闭文件的夹具 | `e2e-targeted-3.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g 'HTML 块&#124;TXT 与 JSON'` | 126 | 1 failed；1 passed (35.3s) | TXT/JSON 通过；HTML 用例等待初次 Editor 挂载超时 | `e2e-remaining.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g 'HTML 块'` | 0 | 1 passed (8.5s) | 沿用现有初次挂载 30 秒预算后通过，磁盘与重开渲染断言均保留 | `fidelity-markup.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 126 | 4 failed；1 skipped；37 passed (7.6m) | 批注取消、标题候选、斜杠逐项、属性写入曾失败。H07 与既有旅程通过 | `e2e-verified.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts tests/e2e/knowledge/comments-s4.spec.ts -g '候选来自当前 Vault&#124;D01/D02' --repeat-each=3` | 126 | 2 failed；4 passed (55.7s) | 批注三次通过，候选两次失败一次通过 | `e2e-flakes.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-matrix.spec.ts tests/e2e/knowledge/editor-s3-properties.spec.ts -g '菜单逐项&#124;属性显示、只改属性' --repeat-each=3` | 126 | 1 failed；5 passed (2.8m) | 属性三次通过，斜杠菜单两次通过一次失败 | `baseline-flakes.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g '候选来自当前 Vault'` | 126 | 1 failed | 延迟真实标题响应 250 ms，稳定复现快速输入失去候选 | `wiki-race-red.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g '候选来自当前 Vault' --repeat-each=3` | 0 | 3 passed (21.1s) | 共享同一标题请求后的三次重跑 | `wiki-race-green.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g '折叠块、对齐'` | 126 | 1 failed | 桌面 CSP 禁止嵌入外站响应 | `blocks.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g '折叠块、对齐'` | 126 | 1 failed | 空 File 样本没有呈现可点占位符 | `blocks2.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g '折叠块、对齐'` | 0 | 1 passed (10.9s) | 已支持的折叠、对齐、音频、附件、数学和 iframe 结构通过。外站导航和占位能力留在缺口记录 | `blocks3.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g '原子 JSX 块&#124;转换为脚注'` | 126 | 1 failed；1 passed (40.6s) | 原子 JSX 键盘通过；首屏第一段选区的脚注气泡不可见 | `bubble-keys.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g '转换为脚注'` | 0 | 1 passed (5.8s) | 用有上下文的正文选区确认真实按钮、写盘和重开 | `footnote2.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 126 | 1 failed；1 skipped；43 passed (9.2m) | 运行启动时加载的仍是首段脚注夹具，单项失败。其他已运行用例通过 | `e2e-final.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g '转换为脚注' --repeat-each=3` | 0 | 3 passed (17.7s) | 当前夹具三次通过 | `footnote-delivery.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g 'Backspace 整体&#124;方向键进入未知'` | 0 | 2 passed (8.9s) | 标签与维基链接原子删除、嵌套 MDX 键盘和保存重开 | `more-keys.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts -g '块类型菜单&#124;重命名拒绝'` | 0 | 2 passed (11.6s) | 菜单类别、标题转换、非法名拒绝与扩展名保持 | `menu-rename.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout.spec.ts tests/e2e/knowledge/editor-s3-matrix.spec.ts -g '原子 JSX 块&#124;菜单逐项' --repeat-each=3` | 0 | 6 passed (2.9m) | 最终全量失败的两个用例单独重跑；JSX 键盘夹具增加方向键发送前的实际 ProseMirror 选区确认。原斜杠菜单用例保留原样。 | `final-retries.log` |

## Modern Web Guidance

按项目流程搜索并读取了 `js`、`accessibility`、`copy-button`、`drag-and-drop`、`spatial-navigation`、`toolbar`、`forms`、`ime-safe-enter-submit`、`dark-mode-toggle` 和 `dark-mode`。

- 查找替换沿用上游语义 search 区域与原生输入控件。自定义键处理检查原生 `isComposing`，并保留 Safari 的 `keyCode === 229` 回退。
- 对可能超限的 HTML 使用 `TextEncoder` 量出 UTF-8 字节数。对已有明确主题偏好的组件先读宿主模式，在回退到系统喜好时订阅媒体查询变化。

最终全量斜杠菜单失败的 trace 显示，插入代码块后用例通过 focus、Ctrl+A、输入起始文字重置，失败快照在代码块正文显示 `/起始`，界面没有 listbox。现有用例保留原样。

H07 测试两次都比较完整磁盘缓冲区。原始样本含 frontmatter、表格、列表、注释、引用定义和 100 段正文。测试要求首改与后改都只有目标字节变化，且关闭标签后重开仍显示编辑和结构。
