# 固定上游测试收集差异（G04）

[测试全集逐文件结果](vendor-test-files.jsonl.gz)按两个固定 Git 树的 JavaScript／TypeScript `*.test.*`、`*.spec.*` 命名枚举，合并实际 Vitest JSON 收集。ORCA 汇入四个摘取测试的单独结果。已收集条目用 Git blob 确定原样或适配。未收集条目保留现有逐项不适用原因、可核对的范围、替代证据或待核对状态。逐文件清单可用 `gzip -dc` 读取，汇总见 [vendor-test-catalog.json](vendor-test-catalog.json)。

```sh
pnpm test:vendor
pnpm exec vitest run plugins/notes/test/orca-pdf-{scale-preference,view-position,range-transport,zoom-wheel}.test.ts \
  --reporter=json --outputFile=/tmp/huhu-orca-tests.json
OK_SRC=/path/to/open-knowledge node packages/editor/build/vendor-test-catalog.mjs /tmp/huhu-orca-tests.json
```

| 案例 | 运行条件与位置 |
| --- | --- |
| 编辑器键图不占桌面菜单加速键 | `app/src/editor/extensions/shared.dom.test.tsx:165` 固定跳过，Huhu 使用独立命令注册表。 |
| 编辑器末尾交互区域避开 Ask composer 保留带 | `app/src/editor/extensions/trailing-affordance.dom.test.ts:432` 固定跳过，未挂载 OK Ask composer。 |
| 测试实际 PowerShell 对单值与单命令参数的解析 | `core/src/handoff/terminal-launch.test.ts:757`，本机缺 `pwsh` 时跳过，`CI=true` 时须有实际 PowerShell。 |
| 测试实际 PowerShell 对启动命令的解析 | `core/src/handoff/terminal-launch.test.ts:832`，同一环境条件。 |

适用分母仍待按产品行为逐条确认。已收集通过数量及名称证明当前运行范围，不应据此判定 OP-D02 的 70% 条件。

## task02 覆盖口径

实际 Vitest 文件按 `copy` 或 `patch` 计入通过数。按固定文件清单，除 `outside-product` 和明确无产品入口的 `not-applicable` 外，均保留在候选分母。部分替代证据与待适配文件暂不计入通过数。逐文件记录的 `needs-adaptation` 是保守分类，需要再核对实际断言，并计入分母。以 JSON 的 `coverage` 为准，达到 70% 所需的数量向上取整。范围外的上游性能用例按这次任务的测试纪律留待集成阶段。
