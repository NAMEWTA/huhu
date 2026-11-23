# t176/task18 · Chromium 显式 feature 参数兼容

Lead `t3p`，worker `t176`，integration。已修复独审指出的 Chromium 152 低项。启用列表现在按锁定上游顺序逐项拆分参数 `:`、分组 `.` 和试验 `<`，在每一步去除段首尾空白，再比较完整 feature 名。原开关字符串原样保留，目标名只出现在其他功能的试验段时不会阻止应用兼容项。 [实现](../../apps/desktop/src/main/chromium-compatibility.ts#L5) · [独审](t17c-report15.md#发现) · [Chromium 152 启用解析](https://github.com/chromium/chromium/blob/152.0.7977.167/base/feature_list.cc#L735-L776)

Chromium 先登记禁用项。对合法的显式启用配置，兼容逻辑现在直接保留用户选择，包括 `Feature.Group:params`、`Feature :params` 和带试验名及分隔前空白的组合。既有 Chromium 版本门槛和禁用列表规则沿用。 [上游优先规则](https://github.com/chromium/chromium/blob/152.0.7977.167/base/feature_list.cc#L413-L417)

## 实际验证

先添加三个回归输入，在原实现上均因意外调用 `appendSwitch` 失败。原文件另有 11 项通过。修复后，同一 Vitest 文件 14 项全通过。新增断言核对原启用、禁用列表逐字不变，并覆盖目标字符串只作为其他 feature 的试验名时仍追加兼容项。 [用例](../../apps/desktop/test/chromium-compatibility.test.ts#L43) · [红灯](t176-chromium-feature-params-red.log) · [绿灯](t176-chromium-feature-params-green.log)

两文件的定向 TypeScript、格式、lint 和 `git diff --check` 均通过。

```sh
export PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH
pnpm exec vitest run apps/desktop/test/chromium-compatibility.test.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023 --types node --esModuleInterop apps/desktop/src/main/chromium-compatibility.ts apps/desktop/test/chromium-compatibility.test.ts
pnpm exec oxfmt --check apps/desktop/src/main/chromium-compatibility.ts apps/desktop/test/chromium-compatibility.test.ts
pnpm exec oxlint -c oxlint.json apps/desktop/src/main/chromium-compatibility.ts apps/desktop/test/chromium-compatibility.test.ts
git diff --check -- apps/desktop/src/main/chromium-compatibility.ts apps/desktop/test/chromium-compatibility.test.ts
```

## 未运行的验证

未执行 Electron、E2E、构建、打包或全仓检查。未提交代码。共享 t176 任务目录在 worker 沙箱内只读，报告写在指定工作树位置。

`hc send t3p` 返回 5，Core lock 所在文件系统为只读。
