# t176/task16 · 输入调度对照的临时 preload

Lead `t3p`，worker `t176`，integration。t18r 的 disabled 臂在开跑前读到 `explicitDisable:false`，因此停在原启动断言，尚未发键。锁定的 Playwright 1.65 将自己的 loader 作为首个 `-r`，loader 通过 `app.commandLine.appendSwitch` 重写 Chromium 禁用功能列表。 [t18r disabled 结果](native-10000-page-only-input-deferral-disabled-9350f32bbe014243e4c81546b0ac1aa5afa9e226.GLtSEw/result.json) · [启动参数](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js#L46121) · [loader 重写](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/server/electron/loader.js#L105)

两臂现共用一个绝对路径的临时 CJS `-r` 参数。启动参数顺序为 Playwright loader、诊断 preload、应用入口。诊断 preload 在 `HUHU_INPUT_DEFERRAL=disabled` 时读取 loader 写出的有效列表，并在缺少 `DeferRendererTasksAfterInput` 时追加该项，保留其他值及顺序。default 臂加载同一文件，不修改开关。已移除旧 CLI 合并逻辑，保留原 `explicitDisable` 与 `explicitEnable` 断言。 [诊断 preload](t18d-xtest/input-deferral-preload.cjs) · [绝对路径](t18d-xtest/launch-args.ts) · [夹具启动](t18d-xtest/native.spec.ts#L105) · [实际开关断言](t18d-xtest/native.spec.ts#L207)

## Lead 串行执行

```bash
PAGE_RECEIVE_ONLY=1 HUHU_INPUT_DEFERRAL=default bash temp/final-audit/t18d-xtest/run.sh 9350f32bbe014243e4c81546b0ac1aa5afa9e226
PAGE_RECEIVE_ONLY=1 HUHU_INPUT_DEFERRAL=disabled bash temp/final-audit/t18d-xtest/run.sh 9350f32bbe014243e4c81546b0ac1aa5afa9e226
```

运行时检查两臂的 `explicitDisable` 依次为 false、true，`explicitEnable` 均为 false，其他功能列表和 Chromium 版本相同。

## 实际验证与未运行项

静态检查了锁定 Playwright 的参数拼装、loader 重写和夹具的绝对 preload 路径。用 Node VM 加载真实 CJS，六个 mock commandLine 用例通过，覆盖默认、未设开关、追加到现有列表、空列表、已含目标和带试验前缀的目标。CJS 与 runner 语法检查、临时夹具定向 TypeScript 检查均通过。未执行 Electron、Core、XTEST、E2E 或构建，真实两臂结果待 Lead 实跑。

```sh
/home/wta/.volta/tools/image/node/24.21.0/bin/node --check temp/final-audit/t18d-xtest/input-deferral-preload.cjs
bash -n temp/final-audit/t18d-xtest/run.sh
PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec tsc --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable,ES2024.Promise --types node --jsx react-jsx --esModuleInterop --resolveJsonModule temp/final-audit/t18d-xtest/native.spec.ts temp/final-audit/t18d-xtest/native.config.ts apps/desktop/src/renderer/env.d.ts
```
