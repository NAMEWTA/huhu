# B06 浏览器先复位后按 Home 或 Ctrl+Home

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout` |
| pane_id | `w4:pM` |
| task | `task02.md` |
| 任务文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pM/task02.md` |
| 报告文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pM/report02.md` |
| 执行结果 | `done` |
| 工作树与分支 | `/home/wta/projects/huhu-wt-pm` · `closeout3/b06` |
| 本地提交 | `b813c90cec10b580caa2654d856bb845a067654b`，基线 `f9f0186` |

## 判红与修复

在 Electron 44.9.1（Chromium 152.0.7977.167，Linux x64）中通过真实 Shift+Tab 重新聚焦。夹具用 Selection API 模拟浏览器先复位到文档起点，并把观察器推迟到可信 Home 键默认动作完成。三条时序在放行前均为 DOM 偏移 0、PM 5→5，按键前后 DOM 端点相同。其中聚焦回调尚未执行的 Home 和 Ctrl+Home 使用夹具的 12 ms 时点，回调已结束的 Ctrl+Home 使用 25 ms 时点。旧版三条均写回偏移 4，PM 维持 5→5。 [判红日志](/tmp/huhu-b06-task02.vAH7kc/red.log) · [判红时序与 trace](/tmp/huhu-b06-task02.vAH7kc/red.json)

修复后的三个场景都保留 DOM 偏移 0，PM 同步到 1→1，随后 Shift+End 选中首段。既有无导航对照仍恢复原段尾。探针控制复位时机和回调放行，真实导航、DOM 选区和 PM 状态由 Electron 中的编辑器处理。 [转绿时序](/tmp/huhu-b06-task02.vAH7kc/focus.json)

## 产物

核对了 1.43.0 的 `DOMSelState` 与键盘处理前的 `forceFlush(true)`。本地 1.41.8 保留待处理的原生导航事件及端点。文档起点处可信、未取消的 Home／Ctrl+Home 可以确认起点。原有的端点移动判断继续用于其他导航。源码、ESM 与 CJS 一致，补丁 SHA-256 和锁文件指纹为 `d462fc3d252f64b879f0d1f951928c11629c14d84da3912015ae5b4d4cf45271`。已同步 R-53、第三方声明、专项测试和 pm-focus 证据。提交保留在本地，工作树干净。 [补丁重放与构建入口](/tmp/huhu-b06-task02.vAH7kc/replay.log) · [跟踪证据](/home/wta/projects/huhu-wt-pm/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/pm-focus/README.md) · [上游发布包](https://registry.npmjs.org/prosemirror-view/-/prosemirror-view-1.43.0.tgz)

## 验证

Electron 批次使用单 worker 和零重试，每批启动前均确认无其他 Electron／Playwright 进程和已知启动测量进程。时间为 UTC+8，负载为 `uptime` 的 1／5／15 分钟平均值。

| 批次 | 结果 | 起止时间与负载 | 证据 |
| --- | --- | --- | --- |
| 旧版专项 | 三条预期判红 | 07:16:32–07:16:45 · 2.78／1.52／2.37 → 4.15／1.89／2.47 | [日志](/tmp/huhu-b06-task02.vAH7kc/red.log) |
| `editor-selection-focus.spec.ts` | 13/13 | 07:17:55–07:20:23 · 17.90／5.42／3.59 → 31.66／17.46／8.49 | [日志](/tmp/huhu-b06-task02.vAH7kc/focus.log) · [uptime](/tmp/huhu-b06-task02.vAH7kc/focus-window.log) |
| 指定知识库回归 | 53/53。选区、收尾、S3、简中和批注 | 07:27:06–07:33:52 · 7.62／14.36／10.48 → 4.62／6.38／7.98 | [日志](/tmp/huhu-b06-task02.vAH7kc/regressions.log) · [uptime](/tmp/huhu-b06-task02.vAH7kc/regressions-window.log) |
| `HUHU_PERF_STRICT=1 perf.spec.ts` | 6/6。打开 1 MiB 文档 431 ms，5,000 行输入 p95 12.7 ms | 07:45:00–07:45:49 · 1.97／3.61／5.66 → 2.72／3.62／5.55 | [日志](/tmp/huhu-b06-task02.vAH7kc/strict.log) · [uptime](/tmp/huhu-b06-task02.vAH7kc/strict-window.log) |
| 独立 Web harness | Chromium 158.0.8127.18。无桌面 preload，复位后的 Ctrl+Home 和 Shift+End 通过 | 07:45:49–07:45:51 · 2.72／3.62／5.55 → 2.72／3.62／5.55 | [日志](/tmp/huhu-b06-task02.vAH7kc/browser.log) |

| 仓库检查 | 结果 |
| --- | --- |
| `pnpm test` · `pnpm test:vendor` | 1,006 通过／1 跳过 · 6,427 通过／4 跳过。[项目](/tmp/huhu-b06-task02.vAH7kc/test.log) · [vendor](/tmp/huhu-b06-task02.vAH7kc/vendor.log) |
| `typecheck` · `lint` · `knip` · `format:check` | 退出 0。Knip 提示两条已存在的配置项。[退出码](/tmp/huhu-b06-task02.vAH7kc/status.tsv) |
| `build` · `notices` · `ok-patches --check` | 退出 0。构建守护 A／B／C 均为 0，补丁登记无漏项。[构建](/tmp/huhu-b06-task02.vAH7kc/build.log) · [声明](/tmp/huhu-b06-task02.vAH7kc/notices.log) · [登记](/tmp/huhu-b06-task02.vAH7kc/ok-patches.log) |
| 补丁与锁文件 | 离线冻结安装成功。已用未打补丁包重放 Git diff，比对四个实际安装文件并加载 ESM、CJS。[冻结安装](/tmp/huhu-b06-task02.vAH7kc/install.log) · [重放](/tmp/huhu-b06-task02.vAH7kc/replay.log) |

## 阻碍与接续

无阻碍。桌面实测为 Linux。浏览器先复位由夹具注入，验证范围覆盖指定时序下的用户行为。

## Lead 验收

- 2026-11-20 Lead：接受，待集成后复验。b813c90 判红三条、转绿三条，专项 13/13 与知识库回归 53/53 零重试；专项批次负载偏高（最高 31.66），属功能测试，不作性能证据；严格性能批次负载 < 2 时启动。浏览器先复位由夹具注入，登记为验证范围说明。
