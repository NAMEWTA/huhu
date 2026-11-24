# 固定上游测试收集差异（G04）

测试全集逐文件结果（本机原件 `temp/dev/feature_2026-11-14-knowledge-ok-parity/integration/legacy-7984bff4/vendor-test-files.jsonl.gz`）按两个固定 Git 树的 JavaScript／TypeScript `*.test.*`、`*.spec.*` 命名枚举，合并实际 Vitest JSON 收集。ORCA 汇入四个摘取单测和 Electron 适配用例的单独结果。已收集条目用 Git blob 确定原样或适配。未收集条目保留现有逐项不适用原因、可核对的范围、替代证据或待核对状态。逐文件清单可用 `gzip -dc` 读取，汇总见 vendor-test-catalog.json（本机原件 `temp/dev/feature_2026-11-14-knowledge-ok-parity/integration/legacy-7984bff4/vendor-test-catalog.json`）。

```sh
pnpm test:vendor --reporter=json --outputFile.json=/tmp/huhu-ok-tests.json
pnpm exec vitest run plugins/notes/test/orca-pdf-{scale-preference,view-position,range-transport,zoom-wheel}.test.ts \
  --reporter=json --outputFile=/tmp/huhu-orca-tests.json
PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/huhu-orca-electron.json pnpm exec playwright test \
  tests/e2e/workflows/viewers.spec.ts --grep 'OP-D09 PDF 查找|G04 ORCA' \
  --workers=1 --retries=0 --reporter=json
node packages/editor/build/vendor-test-catalog.mjs /tmp/huhu-orca-tests.json \
  /tmp/huhu-ok-tests.json /tmp/huhu-orca-electron.json
```

| 案例 | 运行条件与位置 |
| --- | --- |
| 编辑器键图不占桌面菜单加速键 | `app/src/editor/extensions/shared.dom.test.tsx:165` 固定跳过，Huhu 使用独立命令注册表。 |
| 编辑器末尾交互区域避开 Ask composer 保留带 | `app/src/editor/extensions/trailing-affordance.dom.test.ts:432` 固定跳过，未挂载 OK Ask composer。 |
| 测试实际 PowerShell 对单值与单命令参数的解析 | `core/src/handoff/terminal-launch.test.ts:757`，本机缺 `pwsh` 时跳过，`CI=true` 时须有实际 PowerShell。 |
| 测试实际 PowerShell 对启动命令的解析 | `core/src/handoff/terminal-launch.test.ts:832`，同一环境条件。 |

当前分母和原保守分母见 [vendor-test-results.md](vendor-test-results.md)。逐文件结果在 G01 能定位主体时记录 `testedModules`，仅由本轮闭包规则排除的条目另记 `closureExcluded`。固定源原样试跑失败或未取得终态的文件及原因见 [vendor-test-adaptation.json](../../../../../../../docs/upstream/ok-parity/vendor-test-adaptation.json)。明确的 Q2 排除按已有理由保留。112 个待定主体的逐文件复核见 [主体与理由](../../../../../../../docs/upstream/ok-parity/vendor-test-subject-review.json)。Electron 结果因失败项复跑而分成多个 JSON 时，按执行先后追加文件参数。
