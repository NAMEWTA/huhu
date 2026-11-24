# B06 键盘重新聚焦后到达文档起点

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout` |
| pane_id | `w4:pM` |
| task | `task01.md` |
| 任务文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pM/task01.md` |
| 报告文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pM/report01.md` |
| 执行结果 | `done` |
| 工作树与分支 | `/home/wta/projects/huhu-wt-pm` · `closeout2/b06` |
| 本地提交 | `ed092e492bbe44557d813aaf6326893dddf760ea`，基线 `f16f614` |

## 结论

在 Linux x64 的 Electron 44.9.1（Chromium 152.0.7977.167）中，先将光标放在首段末尾并设置失焦，再通过真实 Shift+Tab 重新聚焦。基线的真实 Home 与 Ctrl+Home 分别在聚焦后 14 ms 和 12 ms 把 DOM 光标移到起点。延后执行同一个生产聚焦回调时，观察器把 DOM 偏移从 0 写回 4，PM 留在 5→5，并清零 `lastFocus`。最近一次指针操作分别距 389 ms 和 391 ms。 [基线红灯与 trace 路径](/tmp/huhu-b06.DkdtYL/red3.log)

修复后，两种按键均保留 DOM 偏移 0 和 PM 1→1，Shift+End 选中完整首段。聚焦回调先结束时，观察器也保留 Ctrl+Home 的移动。无导航对照使用同样的键盘重新聚焦，由用例模拟浏览器把 DOM 光标复位到偏移 0，生产观察器将 DOM 和 PM 恢复到初始段尾。 [最终专项与时序附件](/tmp/huhu-b06.DkdtYL/focus-clean-results.json)

## 产物

ProseMirror 补丁将可信原生导航的端点快照用于 20 ms 聚焦回调和观察器的 200 ms 起点恢复窗口。核对了 npm 1.43.0 的聚焦端点比较和独立观察器回退。本地的观察器保护沿用这个端点比较原则。源码 `src/input.ts`、`src/domobserver.ts` 与发布版 ESM、CJS 一致，补丁和锁文件 SHA-256 为 `c7a17fe0b2d6de0729d661036b439747f79d5c66438d0a580b0863cafacdce05`。R-53、生成的 notices、回归文件和 pm-focus 证据均进入上述本地提交。工作树干净，提交未推送。 [跟踪证据](/home/wta/projects/huhu-wt-pm/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/pm-focus/README.md)

## 验证

以下桌面批次使用单 worker、零重试。每批均在启动前确认外部 Electron／Playwright 进程列表为空。时间为本机 UTC+8，负载为 `uptime` 的 1／5／15 分钟平均值。

| 批次 | 结果 | 起止时间与负载 | 证据 |
| --- | --- | --- | --- |
| 旧版专项 | Home、Ctrl+Home 均按预期判红 | 01:59:33–01:59:42 · 1.70／1.52／2.22 → 2.79／1.75／2.28 | [日志](/tmp/huhu-b06.DkdtYL/red3.log) |
| `editor-selection-focus.spec.ts` | 10/10 | 02:26:47–02:27:22 · 1.52／2.39／5.13 → 2.68／2.58／5.09 | [日志](/tmp/huhu-b06.DkdtYL/focus-clean.log) · [uptime](/tmp/huhu-b06.DkdtYL/focus-clean-window.log) |
| 选区、收尾、S3、简中和批注回归 | 53/53 | 02:20:14–02:26:46 · 2.19／4.76／7.06 → 1.52／2.39／5.13 | [日志](/tmp/huhu-b06.DkdtYL/regressions.log) · [uptime](/tmp/huhu-b06.DkdtYL/regressions-window.log) |
| `HUHU_PERF_STRICT=1 perf.spec.ts` | 6/6，1 MiB 文档 432 ms，5,000 行输入 p95 13.6 ms | 02:19:25–02:20:14 · 1.92／5.14／7.29 → 2.19／4.76／7.06 | [日志](/tmp/huhu-b06.DkdtYL/strict.log) · [uptime](/tmp/huhu-b06.DkdtYL/strict-window.log) |
| 独立 Web harness | Chromium 158.0.8127.18，无桌面 preload，真实 Shift+Tab、Home、Shift+End 通过 | 02:27:22–02:27:23 · 2.68／2.58／5.09 → 2.68／2.58／5.09 | [日志与 uptime](/tmp/huhu-b06.DkdtYL/browser.log) |

| 仓库检查 | 结果 |
| --- | --- |
| `pnpm test` · `pnpm test:vendor` | 1006 通过／1 跳过 · 6427 通过／4 跳过。[项目日志](/tmp/huhu-b06.DkdtYL/test.log) · [vendor 日志](/tmp/huhu-b06.DkdtYL/test-vendor.log) |
| `typecheck` · `lint` · `knip` · `format:check` | 均退出 0。Knip 给出两条既有配置提示。[退出码](/tmp/huhu-b06.DkdtYL/status.tsv) |
| `pnpm build` · `pnpm notices` · `ok-patches --check` | 均退出 0。补丁登记未登记 0、多余 0。随包文件通过 Git 补丁重放、实际安装文件比对和 ESM／CJS 加载检查。[构建](/tmp/huhu-b06.DkdtYL/build.log) · [声明](/tmp/huhu-b06.DkdtYL/notices.log) · [补丁检查](/tmp/huhu-b06.DkdtYL/ok-patches.log) |

首轮修复版专项的一条夹具超过了 200 ms 窗口。最终夹具固定 Playwright 的 `Date` 时间，仍使用真实 Chromium 键盘事件和生产回调。随后一轮的 Playwright JSON 已完整记录 10 项通过，但维护验证脚本时原地写入了正在执行的文件，导致外层退出码失真。最终使用完整脚本独立执行，确认 10/10 与退出码 0。 [超时批次](/tmp/huhu-b06.DkdtYL/focus.log) · [中间 JSON](/tmp/huhu-b06.DkdtYL/focus-final-results.json) · [最终日志](/tmp/huhu-b06.DkdtYL/focus-clean.log)

## 阻碍与接续

无阻碍。桌面运行证据来自 Linux。无导航的浏览器复位为夹具模拟，观察器和恢复动作来自真实应用。

## Lead 验收
