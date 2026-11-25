# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task04.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task04.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report04.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/056-ux15.md、058-ux17.md，由 Lead 更新
- 执行结果 — done

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`。执行前 `git merge --ff-only main` 确认基线 `adb29540a480dadb43138bd23f71c7c77bd8761f`。两张票分别提交，最终 HEAD 为 `0fdcc492be29b24cc2de795196b11a9f26e90fe8`。工作树干净，`git diff adb29540..HEAD --check` 与修改后的 spec 的 TypeScript 转译语法检查通过。

原失败记录为 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-ux15-17.log`。此 spec 在文件级关闭 trace，调度指定的结果目录当时没有 UX15 或 UX17 的 trace。UX15 旧日志只有整例 60 秒超时，遗留的合成测试 Vault 没有同步配置写入，因此可以把故障范围收窄到首次保存之前或保存点击时。旧运行中每个宿主最后等待的具体定位器无法从现存附件确认。

### UX15 · 同步表单

- 提交 — `11f9a09c292ea5b05e45c05d79f1fbc88c6769b5`。
- 根因证据 — 工作台在 700px 以下将已展开的模块侧栏置于正文上方，原用例缩窄后保留此状态。用 Lead 构建产物中的现有 CSS 在独立 Chromium 中重放最小布局，480px 样本中 400px 的表单确实只有一列。侧栏占到 x=232，覆盖「仅拉取」和「保存设置」的点击点。收起后两处点击点命中目标，表单保持单列。这个前置条件能解释原用例在窄态选择或保存前的阻塞。
- 改动文件 — `tests/e2e/workflows/workbench-baseline.spec.ts`。缩窄后通过「收起导航」移除遮挡。回到宽窗重进设置时检查设置是否已选中，并在必要时展开侧栏再选页。每个定位器动作限时 10 秒，失败信息可交给双宿主收集器。保留宽窄列数、模式和排除规则、引擎读回及按原 planId 打开中心的验收。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/versioning/test/sync.test.ts`，16/16 通过。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts` 中「UX15 同步表单按容器重排，保存后从原计划继续管理」。复跑可确认 Linux Electron 的完整同步、独立 Web 的仅拉取，以及两端各自的配置保存和原计划链接。

### UX17 · 外观

- 提交 — `0fdcc492be29b24cc2de795196b11a9f26e90fe8`。
- 根因证据 — Lead 的 Electron 点击明确被仍展开的模块侧栏拦截。窄窗上浮是现有外壳的导航行为，页面已有「收起导航」让内容可交互。Chromium 探针在 392px CSS 样本中复现了主题卡中心被覆盖，收起后同一坐标命中卡片。原 Lead Web 样本已通过。
- 改动文件 — `tests/e2e/workflows/workbench-baseline.spec.ts`。缩窄后先收起模块导航，再验证主题卡单列并操作主题、明暗和字号。回到宽窗并重新加载后复用设置导航入口，继续验证持久化与四列。返工只涉及用例。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/ui/test/theme.test.ts`，43/43 通过。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts` 中「UX17 外观按工作区重排四套主题，窄窗切换并重开保留」。复跑可确认两端窄窗真实点击和宽屏重开。

共用布局探针命令为 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/inventory-settings-hit-test-probe.test.ts`，1/1 通过。探针和上述日志保存于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task04/`。探针只加载现有 CSS 和最小结构，未启动 Huhu。

## 阻碍与接续

无阻碍。worker 未运行应用 E2E、构建、打包、全仓 typecheck、全仓 lint、knip 或截图取证。两次提交都只改顶层 Playwright spec，未更改业务包，因此以 spec 转译语法检查作为本轮代码检查。两条真实宿主用例由 Lead 复跑，worker 已回收本轮验证终端。

## Lead 验收
- Lead 2026-11-25：合入 main，UX15–UX17 复验 3/3 通过。
