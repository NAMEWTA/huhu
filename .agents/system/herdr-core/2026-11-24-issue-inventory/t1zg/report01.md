# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1zg
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zg/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zg/report01.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/111-rc.md
- 执行结果 — done

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，基线 `4fb0e8de6d366f4bd208b0891817513063652981`。以下两项分别提交，提交后工作区干净。原始验证日志位于项目 `temp/dev/2026-11-24-issue-inventory/runs/t1zg/task01/`。

### 专注计时 E2E

- 提交 `ff4a40c51e60f3fccd4f1cf34ee210493b22b9da`。改动 `tests/e2e/shell.spec.ts`、`apps/engine/test/engine.test.ts`。
- 第二轮两次复跑均显示「今日完成 0 次」。追踪中，改期断言与下一次 Electron 启动相隔约 0.14–0.17 秒，早于三秒截止。正常退出时，桌面通过 `FocusPauseOnClose` 调用 `home.focus.update pause`，Home 保存剩余时间并将同一截止计划改为 `paused`。Engine 重启后的 tick 只结算 `enabled` 的截止。F32 明确要求正常关窗暂停，AU18 区分常驻运行与停机恢复。 [原复跑日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final2/e2e-rerun2.log)
- Engine 对照通过真实 HTTP 能力启动并改期同一计划，再分别直接停机和模拟桌面退出前主动暂停。越过原截止后、重启前，磁盘完成数均为 0，前者仍为 `enabled`、后者为 `paused`。重启时前者按同一计划及修订补结算一次，产生一条「专注完成」通知。后者保留剩余时间，无下次执行、发生或通知。
- 首页 E2E 保持应用运行至到点，核对今日次数、计时回到 25:00 和完成通知。在习惯持久化场景中正常关闭再重开，额外核对已完成次数仍为 1。

### CSS 类名前缀

- 提交 `c0952129c55fcedd20e6ef4be3bc7312d247c6f1`。改动 `scripts/css-class-exceptions.json`、`scripts/check-css-classes.mjs`。
- `packages/ui/src/styles/base.css:25` 用 `.ok-root` 将 Open Knowledge 内容排除在宿主标题样式之外。该类是 Open Knowledge 宿主适配的编辑器和浮层作用域根，原检查只在 `packages/editor/src/rich/token-map.css` 硬编码放行。将其集中登记到类名例外表并注明用途，移除重复的单文件特判。

### 已运行

以下命令均在该检出使用 Node 24.22.1，持同一个验证锁串行运行。

- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/engine.test.ts -t 'F32：专注截止'`，2 通过，51 跳过。 [日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1zg/task01/focus-engine.log)
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/engine run typecheck`，退出 0。沿用本检出已生成的 vendor 类型。 [日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1zg/task01/engine-typecheck.log)
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm lint`，全部阶段通过。Oxlint 0 警告、0 错误，类名检查及后续检查通过。 [日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1zg/task01/lint.log)
- `git diff --check 4fb0e8de..HEAD` 通过。三项验证各自的临时 Core 终端均已回收，未发现测试或浏览器残留进程。

### 未运行与 Lead 复验

- Playwright 由 Lead 在组合候选运行。`tests/e2e/shell.spec.ts`「首页：专注计时到点（ACC-WB-06）、习惯勾选持久化、自定义隐藏卡片；停用任务插件后任务卡片隐藏」。
- 对照用例均在 `tests/e2e/workflows/acceptance.spec.ts`。「F32：桌面和两个获邀 Web 页面切离专注卡片后由 Engine 到点结算」及「专注计时：运行中关闭应用，退出前暂停并保存剩余时间」。
- 本轮未直接运行独立 Web、真实外部服务或 provider、Windows、macOS、全量单测、全仓类型检查、构建、打包、Knip 或视觉检查。

## 阻碍与接续

无实施阻碍。Lead 在组合候选运行上述 E2E 后验收。

## Lead 验收
- Lead 2026-11-25：合入，候选进入最终验收。
