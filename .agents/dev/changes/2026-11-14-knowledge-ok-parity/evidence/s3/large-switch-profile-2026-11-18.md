# 1 MiB 文档切到实时预览偶发卡死：第 2 轮 profile 证据（2026-11-18）

状态：**未定位根因，未改产品代码。** 下面是已经取得的事实和下一步最小实验；用例与埋点均未提交。

## 已确认的事实

1. **复现率（本 worktree 干净构建 b1ac9d9，空载，原用例 `editor-s3-large.spec.ts` 的 1 MiB 用例）**
   - 默认配置（`trace: retain-on-failure`）：6 次 1 通过 / 5 失败。
   - `--trace=off`：8 次 3 通过 / 5 失败。**所以不是 Playwright 的 trace 录制引起。**
   - 失败形态均为 “Test timeout of 60000ms exceeded”（整个用例 60 s 预算耗尽）。
2. **健康路径的耗时本身就接近 6 s**：带 contentTracing 的 4 次通过运行里，点击到编辑区出现 6.1–6.6 s。CPU profile（`disabled-by-default-v8.cpu_profiler`）自耗时前列：`(program)` 1.8 s、`visit/factory`（unified/remark 解析，`host-fetch-*.js:82310-82317`）约 0.7 s、GC 0.36 s、`set webkitSpeechRecognitionEvent`（实为 DOM 属性 setter）0.3 s、Layout 总计 1.2 s、FunctionCall 4.0 s。没有观察者回调出现在前列。带 `--prof` 采样时通过运行更快（2–5 s），说明耗时对时序敏感。
3. **卡死时主线程无法被 CDP 打断**：带心跳的拷贝用例里，点击后约 +7 s 起 `page.evaluate(() => performance.now())` 持续 BLOCKED（>140 s）；此时 `newCDPSession(page)` 后 `Debugger.enable` 也不返回，所以 `Debugger.pause` 取不到栈（之前取到的单帧栈很可能来自“没有完全卡死”的运行）。
4. **卡死运行的 V8 `--prof` 日志（renderer，187k ticks，118 s）**：
   - 96.4 % ticks 落在 Electron 二进制（native），JS 侧归因几乎全部是 **Playwright 注入脚本的 ARIA 快照代码**：`isElementHiddenForAria` / `processElement` / `visit` / `toAriaNode`（对 12790 个块逐元素取计算样式 + 沿祖先链判断隐藏，O(块数 × 深度)）。
   - 按时间分桶：0–5 s 1235 ticks（aria 46）；5–10 s 6509 ticks（aria 0，这是编辑器挂载的 JS 工作，约 3 s）；**自约 10 s 起每个 5 s 桶都是 ~8350 ticks 且 99 % 是 aria 代码，一直持续到进程结束**。
   - 即：编辑器挂载工作结束后，主线程立刻被一次（或连续多次）超长的 ARIA 快照占满，直到应用被关闭。应用自己的观察者（`CaretLabelLayerView`、`frozen-table-headers`）在这段日志里没有出现为热点。

## 推断（未验证）

- 卡死的直接原因很可能是**测试工具在巨大 DOM 上执行 ARIA 快照**，而不是应用里的观察者死循环：挂载完成后 DOM 有 12790 个块，工具的 ARIA 遍历需要上百秒。
- 是什么触发了这次快照还没查明。候选：Playwright 1.65 在动作之后/失败之前对页面取 ARIA 快照（`--trace=off` 下仍 5/8 失败，所以不是 trace；`error-context.md` 的快照只在失败后才取，但这个日志里快照从 ~10 s 起就在跑，早于 45 s 的断言超时）。需要一个对照实验确认，见下。
- 这个推断**没有**给出可以安全改的产品代码。去掉 `caretLabelLayerPlugin`（第 1 轮）无效与此一致。

## 下一步最小实验（未做）

1. `--trace=off` + 失败时立即 `app.evaluate(({app}) => app.exit(0))`（避免失败后的错误快照污染日志），再用 `--prof` 复现一次失败运行，按时间分桶确认 aria 代码是否仍从挂载结束后立刻开始。
2. 若是：二分触发点——只保留 `page.getByRole("tab", …).click()` 与 `expect(locator).toContainText()` 两步，分别换成 `locator("[role=tab]")`/`evaluate` 轮询，找出触发 ARIA 遍历的 Playwright API；该用例对巨大 DOM 改用 CSS 定位与页内轮询（`perf.spec.ts` 的“页内计时”已是同类做法）。
3. 若否：回到应用侧，用 `Profiler` 在页内用 Worker 心跳定位。

## 方法备忘

- contentTracing：`app.evaluate(({contentTracing}) => contentTracing.startRecording({included_categories:["disabled-by-default-v8.cpu_profiler","devtools.timeline","v8"]}))`，通过运行时可得 `ProfileChunk`（卡死时 stop 需要主线程，可能不返回）。
- V8 日志：`electron.launch({ args:[root,"--no-sandbox", "--js-flags=--prof --logfile=DIR/v8-%p.log --no-logfile-per-isolate --prof-sampling-interval=500"] })`；日志由独立线程写入，卡死时仍有数据；`node --prof-process` 可读（Node 26 对 Electron 44 的 V8 日志有版本不一致警告，但可解析）；`--preprocess` 的输出前有一行 banner，需裁掉再 `JSON.parse`。
- 本机 `perf_event_paranoid=4`、`ptrace_scope=1`：`perf`/`gdb -p` 不可用。
