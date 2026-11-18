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

## 任务 02 收口

业务实现提交 `0c9705cb7758fe2adfd538f0da56b3bd950b03f0`。最终代码与测试提交 `6a19a4c83e3a49e2d6df67e376d318a4a6b54f22`。Electron 44.9.1 / Chromium 152.0.7977.167。任务 02 的原日志在本机 `/tmp/huhu-parity02-fLyyRi/`。各次真实 Electron 运行继续使用本机 Herdr Core。

既有 `editor-s3-matrix.spec.ts` 写入归档的矩阵 JSON，由 Node 预加载器把该文件的读取和写入重定向到本机日志目录，避免覆盖归档。完整用例的启动命令、文件清单和断言保持一致。

| 门禁命令 | shell 退出码 | 实际结果 | 日志 |
| --- | ---: | --- | --- |
| `pnpm typecheck` | 0 | 无逐用例计数 | `final-typecheck.log` |
| `pnpm lint` | 0 | 无逐用例计数 | `final-lint.log` |
| `pnpm test` | 126 | Test Files  1 failed / 82 passed / 1 skipped (84)。Tests  1 failed / 858 passed / 1 skipped (860) | `final-test.log` |
| `pnpm test` | 0 | Test Files  83 passed / 1 skipped (84)。Tests  859 passed / 1 skipped (860) | `final-test-retry.log` |
| `pnpm test:vendor` | 0 | Test Files  290 passed (290)。Tests  6009 passed / 4 skipped (6013) | `final-test-vendor.log` |
| `node scripts/ok-patches.mjs --check` | 0 | 无逐用例计数 | `final-patches.log` |
| `pnpm build` | 0 | 无逐用例计数 | `final-build.log` |
| `pnpm format:check` | 0 | 无逐用例计数 | `final-format-check.log` |
| `pnpm knip` | 0 | 无逐用例计数 | `final-knip.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 126 | 1 failed。1 skipped。56 passed (11.4m) | `final-e2e.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 126 | 2 failed。1 skipped。55 passed (9.7m) | `final-e2e-serial.log` |
| `HUHU_E2E_HUGE_VAULT=1 xvfb-run -a pnpm e2e tests/e2e/knowledge/huge-vault.spec.ts` | 0 | 1 passed (14.2s) | `task02-huge.log` |
| `pnpm --filter @huhu/editor build:harness` | 0 | 无逐用例计数 | `browser-harness-build.log` |
| `pnpm typecheck` | 0 | 无逐用例计数 | `delivery-typecheck.log` |
| `pnpm lint` | 0 | 无逐用例计数 | `delivery-lint.log` |
| `pnpm test` | 126 | Test Files  7 failed / 76 passed / 1 skipped (84)。Tests  13 failed / 846 passed / 1 skipped (860) | `delivery-test.log` |
| `VITEST_MAX_FORKS=2 pnpm test` | 0 | Test Files  83 passed / 1 skipped (84)。Tests  859 passed / 1 skipped (860) | `delivery-test-retry.log` |
| `pnpm test:vendor` | 126 | Test Files  290 passed (290)。Tests  6009 passed / 4 skipped (6013) | `delivery-test-vendor.log` |
| `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 pnpm test:vendor` | 0 | Test Files  290 passed (290)。Tests  6009 passed / 4 skipped (6013) | `delivery-test-vendor-retry.log` |
| `node scripts/ok-patches.mjs --check` | 0 | 无逐用例计数 | `delivery-patches.log` |
| `pnpm build` | 0 | 无逐用例计数 | `delivery-build.log` |
| `pnpm format:check` | 0 | 无逐用例计数 | `delivery-format-check.log` |
| `pnpm knip` | 0 | 无逐用例计数 | `delivery-knip.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 0 | 1 skipped。57 passed (7.3m) | `delivery-e2e.log` |

### 斜杠菜单压力复现

- 原用例用四路独立 Xvfb 与 Electron 用户目录并行，每路执行 `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-matrix.spec.ts -g '菜单逐项' --repeat-each=5`。20 次中 13 次通过、7 次失败。原始快照有 5 次保留引用结构，2 次代码正文为 `/起始`。退出码 126，Playwright 报告失败。日志 `original-1.log` 至 `original-4.log`。
- 复制原测试并只观测键盘、输入和选区，四路各执行 2 次。6 次通过，2 次复现引用分支，日志 `diag-1.log` 至 `diag-4.log`。源探针保存在本机日志目录的 `slash-diagnostic.spec.ts`。原用例 Ctrl+A 后全选区实际为 `0..14`，输入第一个字后得到深度 2 的引用段落。接下来 Enter 和斜杠仍在深度 2 的段落，界面缺 listbox。代码分支的快照中同一复位过程把 `/起始` 留在原代码正文。原来用键盘覆盖可编辑文本的复位方式没有重建顶层段落。代码上下文也会被 `suggestionAllow` 主动排除。
- 交付的定向用例先点选可辨识的顶层段落再触发斜杠。用四路各运行 `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts -g '逐项测试' --repeat-each=5`。20 次全部通过，每次分别从代码块和引用切出后再次打开命令，并验证保存重开。退出码 0。日志 `anchored-1.log` 至 `anchored-4.log`。
- 原用例在本任务指定的测试写入范围外。它仍采用原复位步骤。建议由 Lead 将逐项用例的下一轮触发定位到已验证的顶层段落，或让每次命令运行于独立的初始文档。

### 定向重跑与开发记录

最终提交的第一次根单测并发运行中，服务启动、CLI、Vault 操作和 SSH 等共报 13 项失败。上游单测的 6,009 项断言通过，但 Vitest worker 的 onTaskUpdate 报 RPC 超时，命令退出 126。重跑时限制 Vitest 进程数，避免与完整 Electron 及构建同时竞争。

| 检查 | 退出码 | 实际结果 | 日志 |
| --- | ---: | --- | --- |
| 首次五个专项夹具。暴露角色定位、代码选择和目录折叠条件。 | 126 | 5 failed | `first-target.log` |
| 校正聚焦和角色后验证，暴露 Embed 中文文案未入词表、图片选中断言和格式提示状态。 | 126 | 5 failed | `second-target.log` |
| 四项通过，图片气泡遮住首段、路径因视口隐藏、斜杠夹具定位真实代码节点失败。 | 126 | 3 failed。4 passed (1.6m) | `third-target.log` |
| 图片和斜杠通过。发现 CodeMirror 编辑后草稿重置，资源重命名初测未找到预期磁盘路径。 | 126 | 2 failed。2 passed (29.9s) | `fourth-target.log` |
| 七项通过并确认 11 MiB 附件字节。通常代码 iframe 未呈现预览，弹窗编辑和保存已验证。 | 126 | 2 failed。7 passed (1.3m) | `candidate-target.log` |
| 工作台等价入口和模态编辑用例通过。Callout 发现界面布尔开关未采用描述符默认值。 | 126 | 1 failed。2 passed (35.2s) | `last-target.log` |
| 最终提交上 Callout 下拉、高级折叠、开关、保存关闭重开通过。 | 0 | 1 passed (18.6s) | `final-callout.log` |
| 属性披露首次选择器同时命中三个扩展按钮，定位失败。 | 126 | 无逐用例计数 | `shell-probe.log` |
| 在真实 Electron 以键盘折叠和展开属性区，保留磁盘原文。单层资产目录的右键重命名也实际落盘。 | 0 | 无逐用例计数 | `shell-probe-retry.log` |
| 独立浏览器 Chromium 158.0.8127.18。Embed 提示与 URL 可见，请求数为零，未依赖桌面 preload。 | 0 | 无逐用例计数 | `browser-harness-e2e.log` |
| 规则文件恢复在根单测首次并行运行时超时。单独重跑 1。 | 0 | Test Files  1 passed (1)。Tests  1 passed / 11 skipped (12) | `task02-versioning-1.log` |
| 规则文件恢复单独重跑 2。 | 0 | Test Files  1 passed (1)。Tests  1 passed / 11 skipped (12) | `task02-versioning-2.log` |
| 规则文件恢复单独重跑 3。 | 0 | Test Files  1 passed (1)。Tests  1 passed / 11 skipped (12) | `task02-versioning-3.log` |
| 最终提交上根单测首次并发运行失败的 13 个测试过滤重跑，第 1 次。 | 0 | Test Files  7 passed (7)。Tests  13 passed / 123 skipped (136) | `delivery-root-failed-1.log` |
| 该组单独重跑第 2 次。 | 0 | Test Files  7 passed (7)。Tests  13 passed / 123 skipped (136) | `delivery-root-failed-2.log` |
| 该组单独重跑第 3 次。 | 0 | Test Files  7 passed (7)。Tests  13 passed / 123 skipped (136) | `delivery-root-failed-3.log` |
| 图片选区等待实际 ProseMirror 状态，格式 tooltip 指定名称后，各单项重跑三次，全数通过。 | 0 | 6 passed (38.7s) | `task02-fixture-repeats.log` |
| 紧凑评论单独重跑三次，2 通过、1 失败。该次看到 30 条评论外框和 28 个 ProseMirror。首轮全量的失败点是新增评论正文未出现。 | 126 | 1 failed。2 passed (12.3s) | `task02-e2e-repeats.log` |

定向 Electron 命令使用 `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts`。筛选表达式、运行用例和结果在各原日志首行。图片和格式的二次全量失利用例修正后以 `-g '本地图片&#124;格式气泡' --repeat-each=3` 复跑。紧凑评论重跑使用 `xvfb-run -a pnpm e2e tests/e2e/knowledge/compact-cost.spec.ts --repeat-each=3`。额外的属性按钮和资产探针以 `xvfb-run -a node /tmp/huhu-parity02-fLyyRi/shell-probe.mjs` 运行。最终提交的根单测过滤重跑使用日志中记录的 `pnpm exec vitest run --maxWorkers=2 <7 个测试文件> -t <13 个失败用例>`。初次根 Vitest 超时的单用例重跑命令为 `pnpm exec vitest run --project @huhu/plugin-versioning plugins/versioning/test/history.test.ts -t '规则文件恢复后一律暂停'`。

### Modern Web Guidance

- `security` 指南要求先识别已有 CSP 和跨源 iframe。沿用工作台对外部 iframe 的限制，在渲染层按 Q3 显示来源 URL 与提示，不创建外部请求。
- `accessibility` 指南中的 `role=status` 适合非紧急反馈。外部嵌入和附件下载失败使用已可见的状态文字，下载按钮也支持键盘激活。
- `js` 指南区分 UTF-8 文本与原始字节。经过 Vault 分段读取的 Base64 直接解码到原始字节后构造 Blob。
- 检索的拖拽排序指南适用于同容器顺序。本任务沿用现有资源树原生拖放负载和已验证的文件点击入口，对外部文件拖入继续走附件上传。

## 任务 03 既有斜杠菜单逐项测试

基线提交为 `e212033`。接续任务 02 的复现结果，原测试四路压力下为 13/20 通过。逐项用例实际位于 `tests/e2e/knowledge/editor-s3-matrix.spec.ts`。本次修改前，测试用 Ctrl+A 后输入覆盖上一项内容。代码块和引用结构会留在文档里，下一条命令可能在块内触发。

每项现在使用独立的 Markdown 夹具，先按唯一标题确认打开的文档，再创建并定位到一个顶层空段落。菜单必须有 36 个唯一选项，逐项按完整名称触发。34 项以真实 ProseMirror 文档快照确认内容或结构改变，排除仅清空斜杠查询的情况。文件项验证原生选择器、附件链接和磁盘字节。表情项验证命令确实为当前编辑器派发表情选择请求。Huhu 应用壳目前缺表情选择器，因而该项的证据限于命令派发。

首次独立夹具试跑暴露了文件树点击位置和上传后的附件节点定位问题。中间方案每轮关闭活动 DocTab，在四路下 6/20 通过，14 次卡在等待活动编辑面清空。最终方案确认下一篇独立笔记已经打开，同时保留前面的标签页，移除了这条与斜杠菜单无关的夹具依赖。

### 最终验证

四路各自使用独立 Xvfb 与 Electron 用户目录。在 `/home/wta/projects/huhu-wt-parity` 设置 `HUHU_HERDR_BIN=/home/wta/projects/huhu/apps/desktop/resources/herdr/linux-x64/herdr-core` 后，并行启动四次以下命令。各路使用各自的输出目录。

```sh
xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-matrix.spec.ts -g '菜单逐项' --repeat-each=5 --output "/tmp/huhu-parity03-waVMyW/final-load-$lane"
```

| 检查 | 退出码 | 结果 | 日志 |
| --- | ---: | --- | --- |
| 负载第 1 路 | 0 | 5 通过，5.0 分钟 | `final-load-1.log` |
| 负载第 2 路 | 0 | 5 通过，4.7 分钟 | `final-load-2.log` |
| 负载第 3 路 | 0 | 5 通过，4.6 分钟 | `final-load-3.log` |
| 负载第 4 路 | 0 | 5 通过，5.1 分钟 | `final-load-4.log` |
| `pnpm lint` | 0 | 通过 | `delivery-lint.log` |
| `pnpm format:check` | 0 | 通过 | `delivery-format-check.log` |

本机日志目录为 `/tmp/huhu-parity03-waVMyW/`。校验了 20 份 `slash-matrix.json`，每份选项集合都与归档的 36 项一致，共 720 次命令验证。每份均包含 34 项文档变化、1 项附件入库和 1 项表情命令派发，页面异常列表为空。新的斜杠证据写入 Playwright 独立输出目录，便于并行核对。

Modern Web Guidance 检索了编辑区焦点、菜单键盘及可达名称。测试采用 `html` 与 `accessibility` 的焦点边界原则，在真实顶层段落内确认折叠光标。菜单选项用现有 listbox 内的完整可达名称定位。
