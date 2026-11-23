# t178 / task02 性能探针类型修复

Lead t3p，工作树 integration。已修复 [t17h 日志](perf-probe-types.log) 中的三条错误。

- [perf-diagnostics.ts](../../tests/e2e/helpers/perf-diagnostics.ts) 仅在请求 ID 为字符串时填入 `requestId`。对话框包装保留 Electron 的单参数与 `BaseWindow` 两个重载，按原参数调用绑定到 `dialog` 的原方法，并返回它的原始 Promise。
- [perf.spec.ts](../../tests/e2e/perf.spec.ts) 仅在开启诊断时读取首尾任务 ID，分别省略缺失的字段。

## 验证

- 使用仓库 TypeScript API 对两个目标文件执行语法检查和语义检查。沿用 `tsconfig.base.json` 的 `exactOptionalPropertyTypes`，并加载本机 Electron 声明和桌面 renderer 全局声明。零诊断。
- 两个文件的 `node --check`、定向 `oxfmt --check` 和已跟踪差异的 `git diff --check` 通过。
- 未运行 E2E、Vitest、构建、打包或全仓类型检查。

Lead：t17j 定向 E2E TypeScript 检查退出0。真实性能运行尚待证据。
