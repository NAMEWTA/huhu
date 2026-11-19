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

## 任务 04 编辑器壳层挂载

基线为 `c80391c`，上游为 `44a2e0a`。原始日志和独立测试输出在本机 `/tmp/huhu-parity04-Iw7xbq/`。有关挂载点、产品适用性和真实用例见 [shell-mounts.md](shell-mounts.md)。

- 机器于执行中重启。恢复时确认工作树改动保留，分支 HEAD 仍为 `c80391c`，未暂存。根 `test-results` 中仍是此前任务的产物，`packages/editor/test-results/vendor.json` 是表情 DOM 定向用例的完整输出。被中断的上游测试和类型检查按新一轮执行记录核验。
- `emoji-pilot.log` 首次显示选择器确实加载，Frimousse 结果是 `gridcell`。`emoji-pilot2.log` 验到了键盘／鼠标插入及重开后的正文，重开时检测到 Vault 的回环 IPC。最终只剔除 `127.0.0.1/api/v1/call`，其余页面请求要求为 0。
- `shell-pilot.log` 中源码已打开，焦点未落到 CodeMirror。把可见滚动容器的标识随编辑模式切换后，`e2e-targeted.log` 中四个壳层用例全部通过。该轮 36 项测试在 `Image` 的文档变化断言超时，重启后原测试独立重跑通过（`matrix-reboot.log`）。普通项等目标项的 `aria-selected` 后按 Enter，沿用逐项真实效果检查。`e2e-knowledge-verified.log` 中键盘提交文件项偶发等不到系统选择器。文件项恢复原来的真实点击，表情项也用实际点击打开。最后独立执行 36 项全过。
- `e2e-knowledge-resumed.log` 的第一轮全量在确认 YAML 图标控件的源码模式也需要字典后主动中断。后续轮次统一使用补齐数据路由后的构建。
- Electron 使用共享工作树内的 `herdr-core`，每个 Xvfb 压力分路都有独立的输出目录。全量 Markdown 构造的旧归档 JSON 输出使用预加载器重定向到日志目录。第三方声明同样重定向生成物，保留任务写入范围，生成记录包括 `emojibase-data 16.0.2` 和自动解析的 `emojibase 18.0.0`，均为 MIT。

- `e2e-knowledge-final.log` 中五个壳层用例通过。原批注锚点用例有一次偏移仍为 17，`comments-recheck.log` 独立复跑三次均通过。原拖放用例在关闭目标标签后还会显示上一标签的富文本，关闭断言改为等待目标标签本身消失，并验证重开后该标签为当前标签。修正后独立复跑三次均通过（`sidebar-recheck.log`）。
- 重叠运行的 `e2e-knowledge-delivery.log` 中批注锚点通过，紧凑评论成本用例的提交正文少了后三字，随后主动停止该轮。任务列出的紧凑编辑和保存结算边界交由所属改动处理。下一轮串行复验。
- 36 项最终夹具在 `e2e-knowledge-final.log` 中全过。该轮还记录了原 S2b 保存状态 10 秒未完成的超时。保存结算归属见任务约定，结果未通过后结束该轮。
- `e2e-knowledge-serial.log` 的批注锚点、紧凑评论、拖放均通过。Embed 在修改已有属性后输入框已经关闭，旧夹具在已不存在的输入框上按 Enter 并超时。更新用例观察实时应用后的 URL 状态，再通过页面 Escape 关闭，继续验证保存和重开。独立复跑三次均通过（`embed-recheck.log`）。
- 重启后的上游首次全量扫描 386.8 秒，超过依赖产物检查的 120 秒门限，并伴随 Vitest worker RPC 超时（`test-vendor-resumed.log`）。同一依赖产物用例在缓存预热后复跑 10 项通过，扫描 3.532 秒（`vendor-scan-warm.log`）。

| 门禁或验收 | 退出码 | 结果 | 日志 |
| --- | ---: | --- | --- |
| `pnpm typecheck` | 0 | 重启后完整工作区检查通过 | `typecheck-resumed.log` |
| `pnpm lint` | 0 | 规则与 CSS 检查通过 | `lint-delivery.log` |
| `VITEST_MAX_FORKS=2 pnpm test` | 0 | 83 文件通过，859 用例通过，1 跳过 | `test.log` |
| `node scripts/ok-patches.mjs --check` | 0 | 205 条登记，无缺项或多余登记 | `patches-delivery.log` |
| `pnpm build` | 0 | 补齐源码属性图标路由后的工作树构建通过 | `build-resumed.log` |
| `pnpm format:check` | 0 | 665 文件符合格式 | `format-check-last.log` |
| `pnpm knip` | 0 | 通过，保留两条已有配置提示 | `knip-delivery.log` |
| `pnpm notices` | 0 | 生成 1402 项 | `notices.log` |
| 表情专项，四路各 `--repeat-each=3` | 0（四路） | 12 次均通过，键鼠插入、磁盘、重开、Escape 恢复焦点与请求计数均覆盖 | `emoji-pressure-1.log` 至 `emoji-pressure-4.log` |
| 原样迁入的表情组件 DOM 定向套件 | 0 | 6 项通过 | `emoji-dom.log` |
| 36 项斜杠菜单（含真实表情） | 0 | 36 项与目录一致，表情打开选择器并插入 🎉，页面错误记录为空 | `matrix-delivery.log` 与输出目录下的 `slash-matrix.json` |
| `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 nice -n 7 ionice -c 2 -n 7 pnpm test:vendor` | 0 | 291 文件通过，6015 用例通过，4 跳过 | `test-vendor-serial.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge`，最后一次默认配置全跑 | 126 | 59 通过，3 失败，1 按配置跳过。失败是 D03 批注偏移仍为 17、S2b 关应用时笔记只剩部分输入、文件项用 Enter 未触发系统选择器。随后恢复文件项的点击并独立验证 36 项。 | `e2e-knowledge-verified.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge --retries=2`，最终完整复验 | 0 | 61 首次通过，1 格式选区用例第一次重试通过（Playwright 标为 flaky），1 大 Vault 用例按默认配置跳过。五个壳层专项、36 项矩阵、D03、S2b 和 F10 200 轮均通过。 | `e2e-knowledge-retry.log` 和相应输出目录 |

## 任务 05 集成分支审查修复

按任务合入 `03dc93b` 得到 `ba82498`，随后在 `8116633` 补回源码定位回调。实现与测试提交为 `0f69158512323f0b816433919d1ee20ad03fea53`。本机原始日志及独立 Playwright 输出目录为 `/tmp/huhu-parity05-dE9NZJ/`。改法及行为证据见 [review-fixes.md](review-fixes.md)。

- 合入后先跑 task04 的相关用例。拖放及目标标签关闭、重开仍然通过，Embed 和格式气泡的原英文定位各失败一次。中间版本改用中文界面后，三条目标用例通过。见 `integrated-baseline.log`、`domain-pilot2.log`。
- B06 使用四路独立 Xvfb 和 Electron 数据目录，每路真实执行三次。集成版本 6 次通过、6 次在正文断言中发现后一段已丢失（`b06-red-1.log` 至 `b06-red-4.log`）。在输入前调用原生 DOMObserver 的初版修复中，12 次通过（`b06-green-1.log` 至 `b06-green-4.log`）。最终仅在 DOM 选区快照变化时调用 flush。同样四路首轮 9 次通过，另外 3 次达到 Playwright 默认 60 秒整用例超时（`b06-delivery-1.log` 至 `b06-delivery-4.log`）。对应的单项复跑使用 `--timeout=120000`，操作序列内的等待条件未改。三次分别在 1 分钟负载 55.00、48.80、60.27 下通过，见 `b06-retry-1.log` 至 `b06-retry-3.log`。最终版本共 12 次通过。
- 正文菜单和模板复制的第一次完整专项通过 2 项（`domain-pilot3.log`）。菜单检查附件剪贴板、图片在嵌套目录中定位、双链键盘打开，模板检查落盘、编辑、关闭和重开。
- 从固定提交的 Git blob 还原清单路径，应用仓库中的二进制差异补丁，再逐文件比对。共 1,343 个文件，集合和字节零差异。重放补丁解压为 453,726 字节。差异登记检查 249 条，无缺项和多余登记。见 `replay-delivery.log`、`patches-delivery.log`。
- Wiki、正文右键菜单和模板功能均使用现有宿主能力。模板导入以已落盘源内容为准，目标是 Markdown 副本。普通 Markdown 创建和带版本保存是现有两个宿主命令，异常中断可能留下已创建的空白模板，版本冲突会保留其间的外部编辑。

正文菜单、模板及三个既有用例的三轮组合运行共 14 通过、1 失败（`domain-delivery.log`）。该次磁盘和目标标签均正确，富文本未在可见断言默认的 5 秒内完成挂载。在 `3ef9e63` 给打开目标后的正文可见断言指定 15 秒等待。修复后模板单独三次通过（`template-retry-1.log` 至 `template-retry-3.log`）。

| 门禁 | 实际结果 | 日志 |
| --- | --- | --- |
| `pnpm typecheck` | 通过（0），含 vendor 类型检查 | `typecheck-delivery.log` |
| `pnpm lint` | 通过（0），CSS 仍为登记的 172 项 | `lint-delivery.log` |
| `pnpm build` | 通过（0），Electron 使用包含最终选区守卫的构建 | `build-delivery.log` |
| `pnpm format:check` | 通过（0），687 个文件 | `format-check-final.log` |
| `pnpm knip` | 通过（0），保留既有配置提示 | `knip-delivery.log` |
| `pnpm notices` | 通过（0），生成 1,402 个运行时依赖声明。生成物写到本机日志目录 | `notices-delivery.log` |
| `node scripts/ok-patches.mjs --check` | 通过（0），249 条登记，无缺项或多余 | `patches-delivery.log` |
| `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --replay` | 通过（0），1,343 文件集合和字节零差异 | `replay-delivery.log` |
| `VITEST_MAX_FORKS=2 pnpm test` 首轮 | 失败（126），983 通过、4 失败、1 跳过。CLI 自动启动、Engine 子进程 ready、保险箱、Vault 崩溃恢复均超时 | `test-delivery.log` |
| 首轮单测失败项单独复跑三次 | 三轮均通过（0），每轮 4 通过 | `root-retry-1.log` 至 `root-retry-3.log` |
| 独立 Chromium 浏览器实际运行共享编辑器 | 通过（0），Chromium 158.0.8127.18。无桌面 preload，复核快速换选区、双链键盘和指针菜单、焦点归还与宿主回调 | `browser-build-final.log`、`browser-check-final.log` |
| `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 pnpm test:vendor` | 通过（0），330 文件，6,391 通过，4 跳过。包含本轮迁入的 39 个 DOM 文件 | `test-vendor-delivery.log` |
| `VITEST_MAX_FORKS=2 pnpm test` 完整复跑 | 通过（0），84 文件通过、1 跳过，987 用例通过、1 跳过 | `test-final.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge`，默认单 worker、零重试 | 失败（126），84 通过、3 失败、1 按默认配置跳过。B06、资源菜单、模板、Embed、格式气泡、拖放、IME、36 项斜杠菜单、F10 200 轮均通过 | `e2e-knowledge-delivery.log` 及独立输出目录中的 trace |

完整套件未通过项：A06 的行内菜单仍找英文 `Options`，实际简体中文可达名称为「文件操作选项」。H03 报告编辑器通知区域的 `Notifications alt+T`。完整旅程在档案标签切回后断言磁盘文本，未找到「切回后继续写」。三项的用例或产品代码分别属于文件树任务、本地化任务及会话任务。

- A06 按原测试独立复跑 3 次，均在 `Options` 的定位超时，见 `knowledge-retry-1-1.log` 至 `knowledge-retry-1-3.log`。将测试复制到本机临时目录，仅在副本修改为「文件操作选项」，整条 A06 通过。见 `a06-chinese-final.log`。
- H03 独立复跑 3 次，均在同一个通知区域字符串失败，见 `knowledge-retry-2-1.log` 至 `knowledge-retry-2-3.log`。
- 完整旅程独立复跑 3 次，第 1 次在关闭 JSON 标签后未读到目标只读笔记，第 2 和 3 次通过，见 `knowledge-retry-3-1.log` 至 `knowledge-retry-3-3.log`。

### F09 严格性能门禁

命令为 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '打开 1 MiB|编辑输入延迟'`。门槛分别为 500 ms 与 p95 16 ms，输入每轮 80 样本。机器有 8 个逻辑核心。最后三轮在同机其他 Electron 套件退出后开始，连续两次 `vmstat` 样本均至少 80% idle。测试过程每秒 CPU 样本保存在 `perf-quiet-*-cputimeline.log`。

| 运行 | 起跑前负载 | 打开 1 MiB | 编辑输入 p95 | 退出码 |
| --- | --- | ---: | ---: | ---: |
| `perf-strict.log`，无条件 flush 初版 | 1 分钟负载 4.86，接近空闲的一次快照为 94% idle | 260 ms | 32.5 ms | 126 |
| `perf-delivery.log`，最终代码首次 | 1 分钟负载 32.98，4% idle | 524 ms | 91.4 ms | 126 |
| `perf-idle-1.log`，其他工作树仍在跑 E2E | 负载见 `perf-idle-1-load.log` | 632 ms | 65.7 ms | 126 |
| `perf-idle-2.log`，其他工作树仍在跑 E2E | 负载见 `perf-idle-2-load.log` | 225 ms | 46.7 ms | 126 |
| `perf-idle-3.log`，其他工作树仍在跑 E2E | 负载见 `perf-idle-3-load.log` | 229 ms | 43.0 ms | 126 |
| `perf-quiet-1.log`，空闲复跑 | 1 分钟负载 3.40，95% / 95% idle | 186 ms | 34.3 ms | 126 |
| `perf-quiet-2.log`，空闲复跑 | 1 分钟负载 2.96，86% / 95% idle | 194 ms | 25.2 ms | 126 |
| `perf-quiet-3.log`，空闲复跑 | 1 分钟负载 3.43，95% / 97% idle | 442 ms | 28.3 ms | 126 |

独立审查在 `03dc93b` 的早期运行得到 414 ms 和 17.9 ms，启动前 1 分钟负载 2.52，详见共享区 `w4:pE/report01.md`。这次空闲复跑中 1 MiB 三次合格，输入尾延迟三次均超限。

同一 Electron 构建的诊断对照见 `perf-guard-paired.log` 和本机 `perf-guard-probe.ts`。使用相同的 5,000 行样本、每次新 Vault、80 次 ASCII 输入和 DOM 变更探针。按交替顺序跑 10 次，仅在其中 5 次通过 CDP 从当前编辑器 DOM 移除本任务新增的两条捕获监听，并由 CDP 复核。每次检查 80 个输入样本及可见正文的 80 字符。带守卫 p95 各轮中位数为 26.7 ms，范围 25.2–31.4 ms。移除守卫为 26.8 ms，范围 23.5–32.1 ms。1 分钟负载范围 1.67–2.21。两组范围重叠，全部超过 16 ms，此对照未检出守卫带来可测的尾延迟差异。正式门禁以原用例的空闲三轮为准。

## 任务 06 查找替换按键与 F09

在分支合入 `88fdabd`（合并提交 `0308796`），实现与最终验证构建为 `8cbf09f4a5672ae402b40ebac78f8d0d6223ea8c`。调用点、上游差异、测试计数与 5+5 配对测量见 [f09-findreplace.md](f09-findreplace.md)。原始日志在 `/tmp/huhu-parity06-kHwIIe/`。

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| Electron 查询次数回归 | 修复前 3 键触发 3 次，退出 126。修复后正文与查找输入框的普通键查询增量均为 0，快捷键仍检查浮层。 | `red.log`、`focused.log` |
| 查找替换与键盘交互 | Electron 定向 6 项通过，覆盖查找、替换、IME、Esc、斜杠菜单、表情和 B06。测试的外部浮层夹具需将焦点移到浮层，再按 Escape 验证窗口处理器。独立 Chromium 同样通过。 | `focused-first.log`、`focused.log`、`browser.log` |
| `pnpm typecheck`、`pnpm lint`、`pnpm build` | 全部退出 0。另在独立 main worktree 构建通过。 | `typecheck.log`、`lint.log`、`candidate-build.log`、`main-build.log` |
| `pnpm format:check`、`pnpm knip` | 均退出 0。 | `format-check-final.log`、`knip.log` |
| `pnpm test:vendor` | 330 文件，6,391 项通过、4 项跳过，退出 0。含查找扩展及匹配器 16 项、浮层 DOM 10 项、IME DOM 3 项和链接弹层事件 3 项。 | `vendor.log` |
| `node scripts/ok-patches.mjs --check`、`--replay` | 差异登记 266 条，无缺项或多余登记。固定来源重放 1,346 文件，集合和字节零差异。均退出 0。 | `patches.log`、`replay.log` |
| F09 主线与候选配对 | 各 5 个有效轮，每轮 80 个键，起跑负载 1 分钟值 <4。两侧 p95 中位数为 22.4 / 21.5 ms，差 0.9 ms，在两侧各自轮间波动内。严格 16 ms 门槛均为 0/5。 | `measurements.tsv`、`perf-*.log` |
| 打开 1 MiB | main 194 ms，候选 433 ms，均通过 500 ms 门槛，退出 0。 | `perf-1MiB-main-1.log`、`perf-1MiB-candidate-1.log` |
