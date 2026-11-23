# task15 · Chromium 152 调度兼容点独审

固定候选 `e5693dbf95bc61958fcf764995ae27c7d7d4144a`，比较基线 `0f0a65fdbd09ccb3fa0a9680abc2b7e5a16311f3`。本次只读审查三个源码／测试文件。**候选正式终端洪流已通过。有一项低优先级的显式开关兼容缺陷。** [实现交接](t176-report17.md) · [正式洪流日志](chromium152-formal-flood.log)

## 发现

**低项，部分合法的 Chromium 显式启用配置会被覆盖。** 当前解析只在 `<` 或 `:` 截断 feature 名。Chromium 152 的启用列表还接受 `Feature.Group:参数/值`，并会在拆分参数、组和试验名时剪掉各段的边缘空白。用实际 helper 和内存 CommandLine 验证，`DeferRendererTasksAfterInput.UserGroup:policy/minimal-types` 以及 `DeferRendererTasksAfterInput :policy/minimal-types` 都会被追加到禁用列表；普通名称和带 `<Trial.Group` 的写法则按预期保留。Chromium 先登记禁用再登记启用，所以这两种合法输入原先设置的启用和策略会失效。建议按上游启用语法提取特征名，为组后缀与分隔符前空白补定向回归，传给 Chromium 的原始列表仍原样保留。默认启动臂与已通过的正式用例未使用这些显式配置。 [候选解析](../../apps/desktop/src/main/chromium-compatibility.ts#L9) · [Chromium 152 启用解析](https://github.com/chromium/chromium/blob/152.0.7977.167/base/feature_list.cc#L735-L776) · [禁用优先](https://github.com/chromium/chromium/blob/152.0.7977.167/base/feature_list.cc#L413-L417) · [有效策略参数](https://github.com/chromium/chromium/blob/152.0.7977.167/third_party/blink/common/features.cc#L488-L516)

## 版本、时机与影响边界

- 只在 Chromium 主版本 `152` 有效。其他主版本与缺版本直接返回。普通显式启用／禁用、已有禁用列表顺序和其他功能参数均保持，重复调用幂等。正向行为与实现方 10/10 的单文件记录一致；其启动顺序测试在接线前为红。 [版本和开关](../../apps/desktop/src/main/chromium-compatibility.ts#L6) · [定向用例](../../apps/desktop/test/chromium-compatibility.test.ts) · [10/10 日志](t176-chromium152-unit-green.log) · [接线前日志](t176-chromium152-unit-red.log)
- 主入口在特权协议注册、`app.whenReady()` 和窗口创建前同步调用。锁定 Electron 44.9.1 在主进程应用代码加载后重新初始化 feature list，吸收同步命令行更改。改动只触及当前 Huhu 桌面 Electron 进程的一项 Blink 调度策略，覆盖该运行时的各 renderer 和支持平台。共享 Web、权限、协议、bridge／CREDIT 和正式测试阈值无源码差异。Linux 的结果支持这项暂时兼容措施，其他平台及桌面非终端窗口的密集交互表现仍无本轮运行证据。 [主入口](../../apps/desktop/src/main/index.ts#L22) · [ready 回调](../../apps/desktop/src/main/index.ts#L299) · [锁定 Electron 初始化](https://github.com/electron/electron/blob/v44.9.1/shell/browser/electron_browser_main_parts.cc#L339-L361)

## 运行证据

- **旧构建诊断对照。** 两份 `9350f32b` 的 Playwright 原始 JSON 与各自四个独立附件相符。两臂 Chromium 均为 152.0.7977.167，其他启用和禁用列表相同，放行后的前两秒各实际收到 283 键。默认臂在约 +10 s 停键后于 +10.151 s 看到 DOM 尾标。禁用臂于 +2.131 s 看到尾标，尾标主动结束仍在运行的 XTEST 回放，301 个窗内有效样本 p95 37.1 ms。两臂清理均成功。该对照支持调度策略对密集输入下的延迟有因果贡献，未观测到具体内部等待队列。 [默认日志](deferral-preload-default.log#L111) · [禁用日志](deferral-preload-disabled.log#L111) · [默认原始结果](native-10000-page-only-9350f32bbe014243e4c81546b0ac1aa5afa9e226.d4XkN6/result.json) · [禁用原始结果](native-10000-page-only-input-deferral-disabled-9350f32bbe014243e4c81546b0ac1aa5afa9e226.7jmJXN/result.json) · [上游调度证据](t18d-report04.md#选择这一开关的依据)
- **候选正式洪流已通过。** Lead 在 `e5693dbf` 构建上以 `HUHU_PERF_DIAGNOSTICS=0` 执行原用例。独立回读原始结果，gate 放行后 +973.1 ms 出现完整 DOM 尾标，31 个窗内样本都有真实输入事件及对应的值变化，p95 32.7 ms。用例耗时 3.260 s，无诊断阶段附件。桌面关闭、Core 已启动与停止、目录移除均为 true。其余受影响用例由 Lead 继续定向运行。 [正式日志](chromium152-formal-flood.log#L110) · [正式原始结果](../../../../issue-evidence/huhu-2026-11-22/followup-flood-e5693dbf95bc61958fcf764995ae27c7d7d4144a.DE1syA/result.json)

| 审查文件 | e5693dbf 的 blob |
| --- | --- |
| `apps/desktop/src/main/index.ts` | `8b169c7568b45fafec08377c533ebcab0cf9ddb7` |
| `apps/desktop/src/main/chromium-compatibility.ts` | `139f1a24bcab7a8866b353213d35b075e7becb1b` |
| `apps/desktop/test/chromium-compatibility.test.ts` | `5793a019b9dba53fa49876ad24a81d6a4205c3c3` |

本次执行提交差异检查和内存 helper 对照，读取实现方单测和 Lead 实跑。未另启动 Vitest、Electron、E2E、构建或打包。
