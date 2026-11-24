# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pF
- task：task01.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pF/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pF/report01.md
- 执行结果：done

## 结论

B06 已修复。ProseMirror 聚焦回调在回写前先接收可编辑视图内的非折叠原生选区，并重新检查焦点、视图和快照。对观察器暂缓同步的范围，比较聚焦时的端点，保留随后形成的选区。折叠光标仍可按旧逻辑恢复。

上游确认是同一竞态。1.42.9 通过聚焦快照判断何时回写。本次把该判断用于 1.41.8 的依赖补丁，并按任务约定先通过观察器同步范围。两条新增 Electron 回归均先红后绿。压力下八个用例各 10/10 通过。[上游 #1613](https://code.haverbeke.berlin/prosemirror/prosemirror/issues/1613) · [上游修复提交](https://code.haverbeke.berlin/prosemirror/prosemirror-view/commit/2978d100a6c6f94bf59a97cbe88f53d3bcaf6f9d)

## 产物与改动

- 工作树 `/home/wta/projects/huhu-wt-pm`，分支 `closeout/issue2-pm`，基线 `9b143a4`，提交 `77d5add77dcdd4fb5741db465b55f8bf3fbd7b64`。工作树干净。
- `patches/prosemirror-view@1.41.8.patch` 更新 TypeScript 源和随包发布的 ESM、CJS 入口。补丁由 `pnpm-workspace.yaml` 登记，锁文件记录指纹，`docs/upstream/ledger.md` R-53 记录来源。
- `tests/e2e/knowledge/editor-selection-focus.spec.ts` 增加键盘扩选和快速拖选用例。探针暂存原聚焦回调，两条用例都通过 Chromium 的默认输入行为建立选区。
- 证据位于 `/home/wta/projects/huhu-wt-pm/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/pm-focus/README.md`。日志目录为 `/tmp/huhu-pm-checks/`。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 修复前判红 | 键盘 2 次、拖选 3 次均满足时序前置断言后未显示气泡。另 1 次键盘用例在打开编辑器时超时。 | `/tmp/huhu-pm-red-v2.log`、`/tmp/huhu-pm-red-v2-results/` |
| 修复后转绿 | Electron 44.9.1／Chromium 152.0.7977.167，两条新增用例均通过。回调返回时 DOM 与 PM 已包含完整四字，气泡和脚注按钮均可见。 | `green.log` |
| 折叠光标、失焦和 IME | 独立 Chromium 直接模拟浏览器复位光标，确认仍聚焦时恢复模型光标，失焦后跳过回写。Electron 的 B07 验证 CDP 合成组合、提交和取消。 | `browser-guards.log`、`stress.log` |
| `stress -c 4` 各重复 10 次 | 新增两例、既有 B06 鼠标及斜杠回归、B07 IME、脚注、块类型和 H03，合计 80/80 通过。1 worker、零重试。 | `stress.log`、`stress-env.log`、仓库证据逐例表 |
| `pnpm typecheck` | 退出 0。另以 TypeScript 单独核对新增 e2e。 | `typecheck.log`、`e2e-typecheck-final.log` |
| `pnpm lint` | 重启后重新执行，退出 0。 | `lint.log` |
| `pnpm test` | 退出 0，997 通过、1 跳过。 | `unit.log` |
| `pnpm test:vendor` | 首次 330 个文件、6,391 项通过、4 项跳过，Vitest worker 的 `onTaskUpdate` 超时导致非零退出。全量 e2e 结束后以 `--maxWorkers=2` 重跑，退出 0，计数相同。 | `vendor.log`、`vendor-retry.log`、`packages/editor/test-results/vendor.json` |
| `node scripts/ok-patches.mjs --check` | 退出 0，未登记 0，多余登记 0。 | `ok-patches.log` |
| `pnpm build` | 退出 0，渲染包内核对到补丁后的聚焦回调。 | `build.log` |
| `pnpm format:check` | 退出 0。 | `format.log` |
| `pnpm knip` | 退出 0，提示两条现有忽略项可清理。 | `knip.log` |
| `pnpm notices` | 退出 0，生成 1,402 个依赖记录。唯一差异为 R-53 在生成文件中的镜像，按任务写入范围复原生成文件。 | `notices.log`、`notices-generated.diff` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 退出 0，102 通过、1 跳过。200 轮泄漏专项通过，10 万文件 Vault 按默认配置跳过。 | `full.log`、`test-results/leak-f10.json` |
| 重启恢复 | 核对 HEAD、已暂存文件、未跟踪证据和工作树测试产物。保留重启前已完成的判红、转绿、构建和检查记录，重新执行中断的 lint 和完整的 80 次压力测试。 | `pre-reboot/`、`status.tsv` |

## 阻碍与接续

无阻碍。IME 覆盖为 Electron 内的 CDP 合成组合输入。主机重启前的部分压力运行与 vendor 首次退出均保留原始记录。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过（77d5add）**。修法与上游 1.42.9 一致。
