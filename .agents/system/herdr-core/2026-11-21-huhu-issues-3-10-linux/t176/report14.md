# t176/task14 · 洪流停键诊断变体

Lead `t3p`，worker `t176`，integration。t18d 记录了原密集按键运行中的写入平台，以及停键后约 107 ms 到达 bridge 尾标。生成器已就绪，供 Lead 在同套环境中验证积压的恢复时间是否跟随停键时刻。 [t18d 分析](t18d-report01.md) · [生成器](generate-perf-stop-diagnostic.mjs)

## 生成与执行

在 integration 根目录生成，只生成一个终端洪流用例。生成器逐项要求源码锚点恰好匹配一次，并拒绝覆盖已有目标。

```sh
/home/wta/.volta/tools/image/node/24.21.0/bin/node temp/final-audit/generate-perf-stop-diagnostic.mjs
```

在 t18c 同一固定应用、私有 HOME/PATH、已初始化的 DBus 与 Xvfb 环境内执行下列 Playwright 命令。现有 `env -i` 包装须显式传入 `DIAGNOSTIC_STOP_MS`。第二轮将 `stop_ms` 改为 `10000`，两轮串行。

```bash
set -o pipefail
stop_ms=5000
DIAGNOSTIC_STOP_MS="$stop_ms" HUHU_PERF_DIAGNOSTICS=1 HUHU_PERF_STRICT=1 \
  PLAYWRIGHT_JSON_OUTPUT_FILE="$PWD/temp/final-audit/stop-keys-${stop_ms}.json" \
  "${HUHU_ACCEPTANCE_NODE:-/home/wta/.volta/tools/image/node/24.21.0/bin/node}" \
  "${HUHU_ACCEPTANCE_PLAYWRIGHT:-$PWD/node_modules/@playwright/test/cli.js}" \
  test tests/e2e/perf-stop-diagnostic.spec.ts --grep '停键诊断' --reporter=list,json \
  --output "temp/final-audit/stop-keys-${stop_ms}-artifacts" \
  2>&1 | tee "temp/final-audit/stop-keys-${stop_ms}.log"
```

实验结束后删除临时用例。日志、报告和生成器可留存。

```sh
rm -- tests/e2e/perf-stop-diagnostic.spec.ts
```

## 口径与读数

- gate 放行后按原节奏发 `a`／`Backspace`。到 +5,000 或 +10,000 ms 不再发起新按键。若原尾标通知更早到达，仍提前停键。正在进行的一次 `press` 可能跨过停键点。
- 安静期只等待原 `__huhuFloodDone` Promise 或绝对 +20 秒的 Node 计时器。夹具取消时停止等待。尾标或截止后才执行原双帧结算、观测和断言。用例保留原焦点、gate、满速 10 MiB 命令、观察点、断言、阈值和 Core 清理。
- `终端停键诊断（仅取证）` 注解和 `terminal-flood-keys.json` 记录诊断身份、预定停键时刻、循环退出时刻、停键原因和最后一次驱动发键时刻。附件还单列 renderer 观测的最后一条可信 keydown。用它和 bridge 恢复时刻对齐。未形成相同平台或尾标早于停键点的样本不能判断停键效果。此用例只取证，不计入正式性能验收。

## 实际验证与未运行项

`node --check` 和生成成功。定向类型检查与生成文件的 `oxlint` 退出 0。静态对照确认仅一项测试，原终端夹具和清理、生产命令、观察及最终断言逐段一致。用隔离副本验证锚点缺失或重复时退出失败且不创建目标，已存在的目标保持原样。检查完成后删除了生成文件。未运行 E2E、Electron、Core 或构建。

```sh
PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec tsc --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable,ES2024.Promise --types node --jsx react-jsx --esModuleInterop --resolveJsonModule tests/e2e/perf-stop-diagnostic.spec.ts apps/desktop/src/renderer/env.d.ts
PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec oxlint -c oxlint.json tests/e2e/perf-stop-diagnostic.spec.ts
```
