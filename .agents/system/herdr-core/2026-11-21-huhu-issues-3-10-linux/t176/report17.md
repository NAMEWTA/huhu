# t176/task17 · Chromium 152 桌面启动兼容

Lead `t3p`，worker `t176`，integration。改动已就绪，交 Lead 独审与固定构建验证原正式洪流用例。

t18t 使用同一 `9350f32b` 应用和 Chromium 152.0.7977.167，两臂其他启用与禁用项一致。默认臂在停键后 +10.151 秒显示 DOM 尾标。禁用输入后任务推迟的处理臂在 +2.131 秒显示尾标，并主动结束仍在按原节奏运行的 XTEST 回放。其 301 个窗内样本 p95 为 37.1 ms，两臂用例与清理均通过。该对照支持为当前桌面运行时添加暂时兼容点。 [默认臂](deferral-preload-default.log#L111) · [禁用臂](deferral-preload-disabled.log#L111) · [锁定 Chromium 源码依据](t18d-report04.md#选择这一开关的依据)

## 实施范围

- 核对桌面主进程无现成的 Chromium feature 开关合并工具。复用 Electron `app.commandLine` 与 `process.versions.chrome`，在主入口顶层同步调用，早于特权协议注册、`app.whenReady()` 和首个 `BrowserWindow`。 [启动调用](../../apps/desktop/src/main/index.ts#L22)
- 仅当 Chromium 主版本为 152 且目标功能未显式配置时，在原禁用列表末尾追加 `DeferRendererTasksAfterInput`。保留已有值、试验参数和次序。重复调用不会再追加。显式启用优先保留用户选择，显式禁用或两列表均含目标时也沿用原配置。其他主版本跳过此兼容逻辑。 [开关合并](../../apps/desktop/src/main/chromium-compatibility.ts#L1)
- 作用域为 Huhu 桌面内嵌 Chromium。升级 Chromium 时用原桌面洪流用例复验，再决定是否需要新版兼容措施。共享 Web、SSH、bridge、CREDIT 和正式性能阈值均未修改。

## 实际验证

同一个 Vitest 文件在接入主入口前仅启动顺序用例失败，接入后 10 项通过。覆盖目标和非目标版本、原列表与试验参数、幂等、显式配置优先，以及调用位于主入口且早于 ready 或首个窗口。定向 TypeScript、格式、lint 和 `git diff --check` 均通过。 [单测](../../apps/desktop/test/chromium-compatibility.test.ts) · [红灯](t176-chromium152-unit-red.log) · [绿灯](t176-chromium152-unit-green.log)

```sh
export PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH
pnpm exec vitest run apps/desktop/test/chromium-compatibility.test.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable,ES2024.Promise --types node --jsx react-jsx --esModuleInterop --resolveJsonModule apps/desktop/src/main/assets.d.ts apps/desktop/src/main/index.ts apps/desktop/src/main/chromium-compatibility.ts apps/desktop/test/chromium-compatibility.test.ts
pnpm exec oxfmt --check apps/desktop/src/main/index.ts apps/desktop/src/main/chromium-compatibility.ts apps/desktop/test/chromium-compatibility.test.ts
pnpm exec oxlint -c oxlint.json apps/desktop/src/main/index.ts apps/desktop/src/main/chromium-compatibility.ts apps/desktop/test/chromium-compatibility.test.ts
```

## Lead 正式回归

本轮未运行 Electron、Core、E2E、构建、打包或全仓检查。Lead 固定构建后以诊断关闭方式复跑原 `tests/e2e/perf.spec.ts` 的「终端吞吐」。保留原密集输入、完整 10 MiB、20 秒 DOM 尾标、至少 10 个有效样本、p95 ≤100 ms 和清理判据。现有隔离 runner 的调用如下，`CANDIDATE_SHA` 为新应用的完整构建提交。

```sh
HUHU_PERF_DIAGNOSTICS=0 bash temp/final-audit/run-perf-diagnostic.sh "$CANDIDATE_SHA" flood
```
