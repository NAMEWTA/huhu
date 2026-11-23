# task16 · Chromium 显式 feature 参数复审

**task15 的低项已关闭。** 对照 `e5693dbf95bc61958fcf764995ae27c7d7d4144a..b8f6c4275c2fb13da32ae2907f9ce6223120d103`，本次只读复核两份桌面文件。实现 blob 为 `868cc1e92f1fb66792cefe834e2e24ce0c9c3079`，测试 blob 为 `49a29e221dcd5ce0c632fe1d89cf972ea0a0eeaa`。 [原低项](t17c-report15.md#发现) · [实现交接](t176-report18.md)

- 启用项按 Chromium 152 的顺序拆参数 `:`、分组 `.`、试验 `<`，每段去掉边缘空白，再比较完整的 feature 名。原来漏掉的无试验名分组、参数分隔符前空白及带试验名的组合均正确保留。只有其他功能的试验名、分组或参数里出现目标名称时，仍按默认追加兼容项。两条原始开关列表只用于判断，显式启用时保持逐字不变；需要追加时只在原禁用列表后加目标。禁用列表的既有判断、Chromium 主版本门槛和幂等路径沿用。 [实现](../../apps/desktop/src/main/chromium-compatibility.ts#L5) · [Chromium 152 启用语法](https://github.com/chromium/chromium/blob/152.0.7977.167/base/feature_list.cc#L735-L776)
- 实施者的同文件红灯有 3 个原问题复现，另 11 项通过。返工后 14/14 通过，新增断言校验原始列表逐字不变。独立用当前 helper 及内存 CommandLine 确认 8 种显式启用写法均保持，5 个无关或空输入均正确追加且重复调用只追加一次；同时核对了非目标版本和已有禁用项。两文件提交差异检查通过。 [用例](../../apps/desktop/test/chromium-compatibility.test.ts#L46) · [红灯](t176-chromium-feature-params-red.log) · [绿灯](t176-chromium-feature-params-green.log)
- Lead 在 **`e5693dbf` 构建**的正式定向回归为 5 通过、3 个扩展用例跳过。终端完整尾标约 +997.2 ms，46 个窗内样本 p95 35.0 ms。该证据对应上一构建，`b8f6c427` 的新构建实跑由 Lead 处理。本次未重跑 Vitest、Electron、E2E 或构建。 [正式回归日志](chromium152-perf-regression.log#L109) · [原始结果](chromium152-formal-perf-e5693dbf/result.json)

共享任务目录在当前沙箱为只读，终稿保存在此工作树。
