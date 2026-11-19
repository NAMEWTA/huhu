# B06 编辑器聚焦选区

ProseMirror 1.41.8 的聚焦回调在 20 ms 后比较 DOM 选区和观察器快照。原生扩选可能已在 DOM 生效，浏览器排队发送的 `selectionchange` 此时还未到达观察器。旧回调会把模型里的折叠光标写回，或在 Chrome 拖选时先把新选区记进观察器快照、随后延迟回写。两条路径都可能令气泡工具栏始终拿不到完整的模型选区。[W3C Selection API 事件调度](https://www.w3.org/TR/selection-api/#selectionchange-event)

## 上游与补丁

2026-11-19 查阅了 npm 发布版本、官方 Git 和 Forgejo 工单。上游在 1.42.9 关闭了同一竞态。提交 `77b7c18` 移除旧回调，`2978d10` 按聚焦时的快照及其后焦点端点是否移动决定是否回写。后续重构的实现比较完整端点。[上游工单 #1613](https://code.haverbeke.berlin/prosemirror/prosemirror/issues/1613) · [1.42.9 变更记录](https://code.haverbeke.berlin/prosemirror/prosemirror-view/src/tag/1.42.9/CHANGELOG.md) · [聚焦修复提交](https://code.haverbeke.berlin/prosemirror/prosemirror-view/commit/2978d100a6c6f94bf59a97cbe88f53d3bcaf6f9d)

当前项目固定 1.41.8。通过 `pnpm patch` 和 `pnpm patch-commit` 将修复应用到该版源码和随包发布的 ESM、CJS 入口。回调先检查视图存活、焦点及观察器快照。可编辑视图内的非折叠选区在组合输入之外先交给 `domObserver.flush()`，然后重新读取视图、焦点和 DOM 选区。沿用上游的聚焦快照判断，保留聚焦后形成的范围，即使观察器暂缓同步。其余分支继续使用原有的快照检查和光标恢复。台账为 `docs/upstream/ledger.md` R-53。

## 判红

以 `9b143a4` 构建未修补的 Electron，使用临时 Vault、三个短段落和真实的 Chromium 点击、按键、鼠标拖动。探针只暂存编辑器下一次聚焦注册的 20 ms 原回调，等捕获阶段看到浏览器选中完整四字再执行。判红前确认编辑器仍聚焦、DOM 已选中「需要注释」、PM 模型仍折叠、观察器快照仍然不同。

`xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-selection-focus.spec.ts --repeat-each=3` 的六次尝试中有五次到达气泡断言且失败：键盘 2 次回调立即清空 DOM，拖选 3 次回调令缓存提前与 DOM 相同，但 PM 选区为空。余下 1 次键盘用例在打开编辑器时触及整例 60 秒超时。原始日志 `/tmp/huhu-pm-red-v2.log`，trace 在 `/tmp/huhu-pm-red-v2-results/`。

## 转绿与分支核对

同一工作树重新构建 Electron 44.9.1（Chromium 152.0.7977.167，Linux x64）。已在渲染包内核对补丁后的回调。两条新增 e2e 均通过，回调返回时 DOM 和 PM 已选中完整四字，气泡和脚注按钮随后均可见。`/tmp/huhu-pm-checks/green.log`

独立 Playwright Chromium 158.0.8127.18 加载补丁后的 ESM 包。浏览器 DOM 选区对应的位置从模型 10 移到 6 时，回调把模型更新为 6 并保留全文选区。模拟浏览器把折叠光标复位到位置 1 时，仍聚焦的视图把光标恢复到位置 10。另一个按钮取得焦点时，相同的回调保持 DOM 位置 1 和模型位置 10。`/tmp/huhu-pm-checks/browser-guards.log`

主机重启前，构建、项目类型检查、单独的 e2e TypeScript 检查、冻结锁文件核对及 OK 补丁登记核对均已完成。重启后确认 HEAD 仍为 `9b143a4`，补丁、台账、锁文件、工作区登记和 e2e 均已暂存，证据说明仍未跟踪，工作区默认 `test-results/` 路径没有测试产物。压力测试用的独立临时目录保留了未完整的运行记录，重启前的压力运行和 lint 皆缺少成功退出记录，已重新执行。

## 压力复跑

2026-11-19 18:33:29–18:46:01（Asia/Taipei），8 个逻辑 CPU，`stress 1.0.7` 以 `stress -c 4` 连续运行。Playwright 使用 Xvfb、Electron 随包二进制、1 个 worker、零重试。复跑得到 80/80 通过（12.4 分钟）。记录中逐条核对用例分母。压力进程在测试退出后收回。

| 用例 | 通过／运行 |
| --- | ---: |
| 新增 B06 键盘聚焦扩选 | 10/10 |
| 新增 B06 聚焦快速拖选 | 10/10 |
| 既有 B06 格式化、换段和斜杠插入（`editor-parity-selection.spec.ts`） | 10/10 |
| 既有 B06 段内与跨段拖选、逐行光标（`editor-s3-parity.spec.ts:63`） | 10/10 |
| B07 IME 组合、提交和取消（`editor-s3-parity.spec.ts:151`，CDP 合成输入） | 10/10 |
| 气泡转脚注（`editor-parity-closeout.spec.ts:453`） | 10/10 |
| 气泡块类型菜单（`editor-parity-closeout.spec.ts:551`） | 10/10 |
| 简体中文 H03 气泡、命令和详情（`i18n-zh-hans.spec.ts:127`） | 10/10 |

命令为 `xvfb-run -a pnpm e2e`，测试过滤项为新增文件、表中五个带行号的用例和 `editor-parity-selection.spec.ts`，参数为 `--repeat-each=10 --workers=1 --retries=0`。复跑日志和负载记录位于 `/tmp/huhu-pm-checks/stress.log`、`stress-env.log`、`stress-cpu.log`。重启打断的运行保留在 `/tmp/huhu-pm-checks/pre-reboot/`，未计入结果。

## 仓库检查

仓库检查的原始输出在 `/tmp/huhu-pm-checks/`，命令退出状态在 `status.tsv`。桌面 e2e 指定 `ELECTRON_OVERRIDE_DIST_PATH=$PWD/apps/desktop/node_modules/electron/dist` 使用项目随包 Electron。

- `pnpm typecheck`、`pnpm lint`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check` 和 `pnpm knip` 退出 0。OK 补丁检查无未登记或多余条目。Knip 提示两条历史 `ignoreDependencies` 配置可清理。
- `pnpm test` 退出 0。85 个文件通过、1 个跳过。997 项通过、1 项跳过。
- `pnpm notices` 退出 0，生成 1,402 个运行时依赖记录。生成文件的唯一差异是台账 R-53 的镜像。按任务写入范围恢复生成文件，保存差异于 `/tmp/huhu-pm-checks/notices-generated.diff`。
- `pnpm install --frozen-lockfile --lockfile-only --offline` 退出 0。pnpm 锁定的补丁指纹为 `c40118afa9a7d7ff4e7005ea6afde520efb8224a8ae04aedf291aab9b87d8200`。
- `xvfb-run -a pnpm e2e tests/e2e/knowledge` 退出 0。102 项通过，1 项按默认配置跳过（`HUHU_E2E_HUGE_VAULT` 未启用）。200 轮泄漏专项通过。全量日志为 `/tmp/huhu-pm-checks/full.log`，泄漏测量数据为 `test-results/leak-f10.json`。
- 首次 `pnpm test:vendor` 完成 330 个文件、6,391 项通过、4 项跳过，Vitest 报告一次 `[vitest-worker]: Timeout calling "onTaskUpdate"`，命令以非零退出。`/tmp/huhu-pm-checks/vendor.log`
- 全量 e2e 结束后以 `pnpm test:vendor --maxWorkers=2` 重跑，退出 0。330 个文件通过，6,391 项通过、4 项跳过。`/tmp/huhu-pm-checks/vendor-retry.log`

### Modern Web Guidance

我查阅了 HTML 焦点边界和 JavaScript DOM 事件指南。它们未涉及此处的原生选区调度，补丁复用了 ProseMirror 已有的取选区和折叠判断，事件时序按 Selection API 规范核对。

## 2026-11-20 · Home 后的折叠光标

在 `3dbd420` 上以真实 Electron、鼠标和键盘复现。点击「需要注释」末字右缘后，Home 把 DOM 光标移到偏移 0，PM 仍为 11→11。原 20 ms 回调在观察器之前执行，DOM 偏移回到 4。补丁后的同一用例中，回调返回时 DOM 偏移保持 0，PM 变为 7→7。随后 Shift+End 选中 7→11，并显示气泡。 [红灯日志](/tmp/huhu-pH02/red.log) · [绿灯日志](/tmp/huhu-pH02/green.log)

每次聚焦创建独立的待处理记录。在 PM 允许浏览器处理的可信导航键上记录其默认动作前的 DOM 端点。延迟回调发现该次导航改变了编辑器内的折叠光标时，先调用 DOM 观察器，避免恢复旧模型位置。记录随回调消费，仅属于对应的聚焦。原扩选判断保留。专项另验证了带旧按键记录的普通重新聚焦、CDP 合成 IME 组合和提交、销毁后的延迟回调、原键盘扩选及鼠标拖选。

核对 npm 1.43.0 和上游 Git HEAD `c828930`。上游在重构后的 `DOMSelState` 中比较前后端点，只有端点仍相同时才把模型同步到 DOM。本地回移快照比较原则，在固定的 1.41.8 中用现有 DOM 观察器读取光标，并保持任务指定的导航、编辑和组合边界。源码、ESM 与 CJS 同步更新。 [1.43.0](https://www.npmjs.com/package/prosemirror-view/v/1.43.0) · [上游 HEAD 源码](https://code.haverbeke.berlin/prosemirror/prosemirror-view/src/commit/c828930c0514183eaa9061103105f32ac7438b29/src/input.ts) · [Selection API 调度](https://www.w3.org/TR/selection-api/#selectionchange-event)

完整知识库回归初跑有一条重新聚焦用例未等 End 的原生光标同步到 PM 就触发失焦，夹具的模型仍在段首。用例现先等待 DOM 与 PM 都确认段尾，再开始重新聚焦并模拟光标复位。该用例以零重试独立执行 10 次，全部通过。 [首轮回归](/tmp/huhu-pH02/regressions.log) · [专项复跑](/tmp/huhu-pH02/refocus-repeat.log)
