# task02 · B06 聚焦后保留 Home 移动的折叠光标

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout` |
| pane_id | `w4:pH` |
| task | `task02.md` |
| 任务文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pH/task02.md` |
| 报告文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pH/report02.md` |
| 工作目录 | `/home/wta/projects/huhu-wt-pm` |
| 分支与基线 | `closeout/issue2-pm`，快进到 `3dbd420` |
| 提交 | `10f8dd6c5813e429bde6c275d17ee59269be6dbf`（实现），`f9dbed316bc7202226d892a0c8756767ba924a03`（验证夹具） |
| 执行结果 | `done` |

## 结论与实现

在固定的 1.41.8 中，聚焦后的延迟回调会把尚未同步的折叠 DOM 光标写回旧 PM 位置。该问题已在相同的 Electron 交互和回调时序下完成修复前后对照。 [疑难分析](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report05.md) · [判红](/tmp/huhu-pH02/red.log) · [转绿](/tmp/huhu-pH02/green.log)

| 时点 | 基线 | 修复后 |
| --- | --- | --- |
| 点击段尾，按 Home | DOM 折叠在偏移 0，PM 11→11 | DOM 折叠在偏移 0，PM 11→11 |
| 放行原聚焦回调 | DOM 回到偏移 4，PM 仍为 11→11 | DOM 保持偏移 0，PM 为 7→7 |
| Shift+End | 红灯在回调后断言处结束 | DOM 与 PM 选中「需要注释」，PM 7→11，气泡可见 |

每次聚焦建立独立记录。PM 未接管的可信导航按键在默认动作前保存 DOM 端点。若回调执行时视图仍存活、聚焦、可编辑且未组合输入，折叠端点仍在编辑器内并相对该次按键移动，先让 DOM 观察器读取。没有本次导航时恢复旧有光标语义。既有非折叠选区路径继续使用聚焦时快照判断。 [补丁](/home/wta/projects/huhu-wt-pm/patches/prosemirror-view@1.41.8.patch) · [回归用例](/home/wta/projects/huhu-wt-pm/tests/e2e/knowledge/editor-selection-focus.spec.ts)

核对了 npm 1.43.0 与上游 Git HEAD `c828930`。上游在新的 `DOMSelState` 中比较 DOM 选择快照，并仅在端点仍相同时同步模型到 DOM。本地回移快照比较，在固定版本中沿用原有观察器。源码、ESM、CJS 的已安装内容逐字节核对。pnpm 重新生成的锁文件只改变该补丁指纹，更新为 `da42778675211e26b06cb163d935e568bed5ee521a7b40f2495a72233f30f50e`，R-53 和 notices 已同步。 [上游版本](https://www.npmjs.com/package/prosemirror-view/v/1.43.0) · [上游 HEAD](https://code.haverbeke.berlin/prosemirror/prosemirror-view/src/commit/c828930c0514183eaa9061103105f32ac7438b29/src/input.ts) · [R-53](/home/wta/projects/huhu-wt-pm/docs/upstream/ledger.md) · [证据](/home/wta/projects/huhu-wt-pm/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/pm-focus/README.md)

## 验证

所有 Playwright 批次均零重试。每批启动前确认无其他活动的 Electron 或 Playwright，起止时间和负载记在对应的 `*-window.log`。基线判红的进程检查及起止 uptime 在 `red-availability.log`。 [命令退出记录](/tmp/huhu-pH02/status.tsv) · [批次与负载日志目录](/tmp/huhu-pH02/)

| 命令或范围 | 结果 | 日志 |
| --- | --- | --- |
| `editor-selection-focus.spec.ts` Home 判红 | 基线在回调后断言失败，Playwright 退出 1，外层返回 126 | [red.log](/tmp/huhu-pH02/red.log) · [trace 目录](/tmp/huhu-pH02/red-artifacts/) |
| `editor-selection-focus.spec.ts` 全部 | 6 通过。Home、普通重新聚焦、CDP IME、销毁、键盘扩选和快速拖选 | [green.log](/tmp/huhu-pH02/green.log) · [起止](/tmp/huhu-pH02/green-window.log) |
| `pnpm test` | 1006 通过，1 跳过 | [test.log](/tmp/huhu-pH02/test.log) |
| `pnpm test:vendor` | 6427 通过，4 跳过 | [vendor.log](/tmp/huhu-pH02/vendor.log) |
| `pnpm typecheck` / 新 E2E 文件的独立 TypeScript 检查 | 均通过 | [仓库](/tmp/huhu-pH02/typecheck.log) · [E2E 文件](/tmp/huhu-pH02/focus-test-typecheck-final.log) |
| `pnpm lint` / `pnpm knip` / `pnpm format:check` | 通过 | [lint](/tmp/huhu-pH02/lint-final.log) · [knip](/tmp/huhu-pH02/knip.log) · [格式](/tmp/huhu-pH02/format-final.log) |
| `pnpm build`（含 `check:ok-css`） | 通过，提交后生产构建与绿灯所用 main、preload、renderer 文件哈希一致 | [构建](/tmp/huhu-pH02/build-final.log) · [绿灯清单](/tmp/huhu-pH02/green-bundle-sha256.txt) · [提交后清单](/tmp/huhu-pH02/final-bundle-sha256.txt) |
| `pnpm notices` / `node scripts/ok-patches.mjs --check` | 通过，0 项未登记、0 项多余登记 | [notices](/tmp/huhu-pH02/notices.log) · [OK 补丁](/tmp/huhu-pH02/ok-patches.log) |
| `pnpm install --frozen-lockfile --offline` | 通过 | [install.log](/tmp/huhu-pH02/install.log) |
| 指定知识库回归 | 59 通过，覆盖 `editor-selection-focus`、`editor-parity-selection`、`editor-parity-closeout.spec.ts` 全部、`editor-s3-*`、`i18n-zh-hans` 和 `comments-*` | [完整回归复跑](/tmp/huhu-pH02/regressions-final.log) · [起止](/tmp/huhu-pH02/regressions-final-window.log) |
| `HUHU_PERF_STRICT=1 ... perf.spec.ts` 全部 | 6 通过。F09 p95 **14.2 ms**，最大 16.0 ms，80 个按键样本 | [严格测试](/tmp/huhu-pH02/strict.log) · [起止](/tmp/huhu-pH02/strict-window.log) |
| `editor-parity-closeout.spec.ts:580 --repeat-each=30 --workers=6` | 30/30 通过，验证选区、菜单、二级标题保存与重开 | [压测](/tmp/huhu-pH02/pressure.log) · [起止](/tmp/huhu-pH02/pressure-window.log) |
| 独立编辑器浏览器入口 | Chromium 158.0.8127.18 通过。无桌面 preload，真实 Home、原回调和 Shift+End 复现路径通过 | [构建](/tmp/huhu-pH02/harness-build.log) · [浏览器](/tmp/huhu-pH02/browser.log) · [起止](/tmp/huhu-pH02/browser-window.log) |

首轮知识库回归 58 通过、1 失败。重新聚焦夹具在 PM 读到 End 导航之前触发失焦，回调前模型已在段首。用例现在先确认 DOM 和 PM 都已到段尾，再模拟恢复焦点时的 DOM 复位。专项用例复跑 10/10，完整回归复跑 59/59。该调整只涉及用例和证据。 [初跑](/tmp/huhu-pH02/regressions.log) · [专项复跑](/tmp/huhu-pH02/refocus-repeat.log) · [完整复跑](/tmp/huhu-pH02/regressions-final.log)

附加检查直接编译 npm 包的 TypeScript 源码时出现了依赖内部类型缺失的报错。统一源文件解析和 DOM 类型后，使用同一配置对修复前后源码对照，剩余诊断完全一致。仓库类型检查和发布入口构建均通过。 [独立检查初跑](/tmp/huhu-pH02/patch-source-typecheck.log) · [基线](/tmp/huhu-pH02/patch-source-baseline.log) · [实现](/tmp/huhu-pH02/patch-source-typecheck-rerun.log) · [诊断对照](/tmp/huhu-pH02/patch-source-diagnostic-diff.log)

Modern Web Guidance 查阅了键盘焦点和组合事件的指南。回移复用了 ProseMirror 的输入分派、选区快照和观察器接口，`selectionchange` 调度按 W3C Selection API 的队列定义核对。 [Selection API](https://www.w3.org/TR/selection-api/#selectionchange-event)

## 阻碍与接续

本任务的实现与指定验收项已完成。

## Lead 验收

Lead（2026-11-20）：接受。判红转绿、:580 压测 30/30、F09 严格 14.2 ms。已 --no-ff 合入集成分支。
