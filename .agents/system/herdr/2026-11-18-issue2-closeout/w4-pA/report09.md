# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pA
- task：task09.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task09.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report09.md
- 执行结果：done

## 结论

启动脚本已从浏览器首个同时满足工作台非零布局、CSS 可见和「引擎就绪」的 rAF 采样取时。浏览器与 Node 各自加上 `performance.timeOrigin` 后相减得到 `homeMs`。同次启动并行保留原先后等待得到的 `homeLocatorMs`。rc.4 对照和同构建 A/A 冒烟均通过。

## 产物与改动

- 工作树 `/home/wta/projects/huhu-wt-parity`，分支 `closeout/issue2-parity`，开工快进到 `cf882bd7805f99b73b0e4c4f9753eb160759de4d`。交付提交 `6d76add4ee2708c854f954ff3a13273f0a72781e`，工作树干净。
- 唯一代码改动是 `scripts/measure-notes-startup.mjs`。逐样本输出 `homeMs`、`homeLocatorMs`、`inboxMs`、`noteMs`。每侧给出 p50/p95，配对按相同 `sample` 编号匹配，输出 `pairs`、`pairedMedianDeltaMs` 和 `candidateSlowerPairs`。差值方向为右侧减左侧，只有严格正值计入较慢对数。
- `--aa 2` 使用同一候选构建的 `candidate-a`、`candidate-b` 两个标签。两种模式均每对交替先后，独立启动 Electron 和 profile，每次复制同一份 2,001 篇 Vault。收件箱与首篇笔记沿用原来的计时路径，rc.4 沿用旧版笔记定位。

## 验证

候选产物重新构建自 `cf882bd`，旧版产物为 `9132640`。原始日志与 JSONL 位于 `/tmp/huhu-task09-MUdsRh/`。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| `node --check scripts/measure-notes-startup.mjs` | 退出 0。 | `node-check.log` |
| `xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 2` | 2 对、4 次成功，退出 0。1 分钟负载前后为 0.65 / 2.02。 | `rc4.jsonl`、`rc4.stderr`、`rc4-environment.log` |
| `xvfb-run -a node scripts/measure-notes-startup.mjs --aa 2` | 2 对、4 次成功，退出 0。1 分钟负载前后为 2.02 / 2.79。 | `aa.jsonl`、`aa.stderr`、`aa-environment.log` |
| 进程与输出核对 | 两轮前后均未检出其他活跃 Electron 或 Playwright 进程。逐项从原始样本复算两侧的 p50/p95、配对差中位数和候选较慢对数，检查交替顺序与 A/A 构建信息一致，均通过。 | 两份 `*-environment.log`、`verify.log` |
| `pnpm lint`、`pnpm format:check` | 均退出 0。 | `lint.log`、`format.log` |

## 阻碍与接续

无。两轮各 2 对仅验证流程与输出，正式 20 对由 Lead 执行。

### Modern Web Guidance

我检索了帧计时与元素可见性。互动绘制指标用于归因交互后的画面，本任务用浏览器时钟记录工作台满足指定就绪条件的时刻，沿用了复审探针中的 DOM 条件，未接入绘制指标。

## Lead 验收

Lead（2026-11-19）：接受。已 --no-ff 合入集成分支；正式 20 对 + A/A 由 Lead 在最终构建上执行。
