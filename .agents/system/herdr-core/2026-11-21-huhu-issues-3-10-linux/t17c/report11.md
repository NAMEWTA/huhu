# task11 · 诊断附件清理复核

**report10 的低项已关闭。** 本次只复核插件诊断清理和洪流诊断取消边界。当前 `perf.spec.ts` blob 为 `f4c23314c3a06f881e0da89a63dfd8eb63176dd5`。在内存中撤回这两处返工后，重算的 blob 与 report10 记录的 `71659b6fabebf620308d04f8995e4990f0d2c4a2` 完全一致。两个诊断 helper 的 blob 也与上次一致。 [原低项](t17c-report10.md#审查结论)

- **插件诊断。** `attach()` 整体受 2 秒等待上限约束。写附件拒绝或超时后只记录诊断日志，进入独立的 `finally`，按原顺序关闭 Electron、移除临时 Vault。 [插件清理](../../tests/e2e/perf.spec.ts#L95)
- **洪流诊断。** Core 读取返回后先检查 teardown signal，已取消时直接退出。另给附件 2 秒等待上限，失败只记诊断日志。附件结算后再次检查 signal，仍有效时继续原尾标及样本断言。 [洪流取消检查](../../tests/e2e/perf.spec.ts#L576) · [正式断言](../../tests/e2e/perf.spec.ts#L622)

2 秒是调用方等待上限。底层已开始的附件写入仍可能自行结算，诊断 await 到期后即可进入清理或继续正式断言。 [限时实现](../../tests/e2e/helpers/candidate-desktop.ts#L17)

本次完成静态复核和 `git diff --check`。Lead 已记录定向格式及 lint 通过。未复跑返工后的类型检查、E2E 或构建。
