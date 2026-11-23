# t176/task13 · 诊断日志字段净化

Lead `t3p`，worker `t176`，integration。已处理 t17c 独审的诊断日志低项。 [审查报告](t17c-report13.md#发现)

- 直连探针按字节累计 Core stderr，无需解码或保留文本。启动、读屏、停止和测试失败只报告固定阶段、异常类别和白名单错误码，其他错误码投影为 `null`。停止回执、Core 地址、版本与读屏方式也限制在各自的已知字段或格式。 [直连探针](../../packages/herdr-client/test/attach.live.test.ts#L34)
- bridge 附件通过显式 Zod 字段白名单投影进来的记录。仅接收生成器格式的会话 ID、UUID v4 连接 ID、bridge 已有事件枚举和有效的数值统计。计数须为非负整数，时间须为非负有限数，缺失阶段时间沿用 `null`。顶层和嵌套额外字段均被剔除，字段类型或值不符的整条记录跳过。 [桥接投影](../../tests/e2e/helpers/perf-diagnostics.ts#L58)

## 实际验证

定向类型检查、两个文件的格式与 lint 检查、`git diff --check` 均通过。类型检查命令如下，使用 `PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH`。

```sh
pnpm exec tsc -p packages/herdr-client/tsconfig.json --pretty false
pnpm exec tsc --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable,ES2024.Promise --types node --jsx react-jsx --esModuleInterop --resolveJsonModule tests/e2e/helpers/perf-diagnostics.ts apps/desktop/src/renderer/env.d.ts
pnpm exec oxfmt --check packages/herdr-client/test/attach.live.test.ts tests/e2e/helpers/perf-diagnostics.ts
pnpm exec oxlint -c oxlint.json packages/herdr-client/test/attach.live.test.ts tests/e2e/helpers/perf-diagnostics.ts
git diff --check -- packages/herdr-client/test/attach.live.test.ts tests/e2e/helpers/perf-diagnostics.ts
```

用 Node `PassThrough` 向实际收集函数重放 t18c 已保存的 26 条合法记录，投影后逐条相等。合成分块记录中的额外顶层、嵌套字段均被剔除；未知事件、非法 ID、负计数、字符串计数、空记录时刻和超出有限范围的时刻共七条被拒绝。 [重放输入](flood-bridge-artifacts-9350f32b/terminal-flood-bridge.json)

## 未运行的验证

沿用 t188 直连及 t18c 桌面运行证据。本轮未启动 Core、Vitest 或 E2E，未构建。业务 bridge、CREDIT、洪流与阈值沿用现状。
