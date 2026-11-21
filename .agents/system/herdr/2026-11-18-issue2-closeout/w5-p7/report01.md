# task01 执行回报

- 共享根：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- pane_id：`w5:p7`
- task：`task01.md`
- 任务文件：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p7/task01.md`
- 报告文件：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p7/report01.md`
- 执行结果：`blocked`
- 工作树：`/home/wta/projects/huhu-wt-w5`，分支 `closeout4/wp5`，基线 `eb7c594`，交付提交 `c238bf2`，未推送。

## 子要求

| 编号 | 原分类 | 交付状态与断言 |
| --- | --- | --- |
| G04 适用分母 | 缺验证 | G01 确认 604 个固定测试的被测模块未进入闭包，逐文件记录模块、`omit` 处置及理由。Q2 和已登记不适用理由逐条比对一致。112 个主体尚未与 G01 确认对应的文件留在分母，另有 84 个已定位到闭包但还待适配。见 `.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/vendor-test-results.md:5` 及同目录 `vendor-test-files.jsonl.gz`。 |
| G04 70% 闸门 | 缺验证 | 新增 154 个固定 OK 上游文件接入 `test:vendor`。OK 候选闭包口径 512／711（72.01%），原保守分母 512／1315（38.94%）。ORCA 独立为 4／11（36.36%）。55 个原样试跑失败或未取得终态的文件列在 `evidence/vendor-test-adaptation.json`。 |
| H04 核心读取、预览、模板 | 缺验证 | 成功候选、状态提示和关联排序回退见 `packages/editor/test/host-feedback.test.tsx:79`。文档和反链数独立回退、外链预览保留 URL、模板读取失败仍可新建的断言分别见该文件第 310、272、355 行。 |
| H04 文件写入、上传 | 缺验证 | 真实资源树覆盖复制、内联重命名、删除、目录创建、列表、完整路径菜单、模板导入、拖入上传的成功和拒绝 UI。见 `packages/editor/test/file-tree-feedback.test.tsx:29`。Electron 验证图片写入真实字节并解码，以及类型拒绝、空文件拒绝、模板同名提示与原文件保留。见 `tests/e2e/knowledge/attachments.spec.ts:84`、`tests/e2e/knowledge/attachments.spec.ts:112`、`tests/e2e/knowledge/editor-parity-assets-template.spec.ts:106`。 |
| H04 批注、桌面桥 | 缺验证 | 创建、回复、删除、解决、重开、重定位的成功渲染与失败 toast 见 `packages/editor/test/host-feedback.test.tsx:138`。系统外链打开失败时断言原生错误框的文案及目标见 `apps/desktop/test/external-link.test.ts:46`。批注列表 GET 的失败状态仍缺明确 UI，见 `packages/editor/src/vendor/open-knowledge/app/src/comments/CommentsPanel.tsx:19`。端点总表为 `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/endpoint-matrix.md`。 |
| B01 旧矩阵逐能力链接 | 缺验证 | 72 行保留具体断言链接，94 行撤回旧标记并写明缺口。列表项拖放断言新顺序、嵌套结构和编号序列化，见 `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/list-item-drag.test.ts:417` 与第 437 行。列表编辑辅助通过真实键盘重排与选区端点断言覆盖，见 `packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/block-mover.test.ts:163`。React 选区随选中和离开清理见 `packages/editor/test/block-selection.test.tsx:26`。 |

## 改动摘要

- 复用 G01 来源清单、OK test:vendor 夹具和已存在的 Electron 知识库夹具。固定上游测试原样迁入并逐路径登记 PATCHES，重放清单重新生成。
- H04 测试替换 Engine 或系统边界，保留真实路由、客户端解析和消费组件。向端点矩阵登记已观察到的成功、失败与回退。
- B01 的标记以当前可定位的断言为准。历史运行证据保留在原来的记录。

## 验证

- `pnpm --config.verify-deps-before-run=false test:vendor --maxWorkers=4 --outputFile.json=/tmp/huhu-w5p7-vendor-final.json` 首轮 515 文件通过、9,066 用例通过、4 跳过，Vitest worker RPC `onTaskUpdate` 超时使包装命令退出 126。用 `--maxWorkers=3 --reporter=dot --reporter=json --outputFile.json=/tmp/huhu-w5p7-vendor-retry.json` 复跑，计数一致，退出 0。日志 `/tmp/huhu-w5p7-vendor-{final,retry}.log`。
- 4 个 ORCA 相关 Vitest 文件、13 个断言通过，退出 0。日志及 JSON 为 `/tmp/huhu-w5p7-orca.{log,json}`。
- 根 `pnpm --config.verify-deps-before-run=false test --maxWorkers=2`，最终 Vitest 95 文件通过、1 文件跳过，1079 用例通过、1 用例跳过，退出 0，日志 `/tmp/huhu-w5p7-test-clean.log`。四个新增或增补断言文件的定向 Vitest 为 43 项通过，退出 0（`/tmp/huhu-w5p7-final-targeted.log`）。迭代中修正了 jsdom 编辑器挂载、批注 fixture 与测试定位。
- `xvfb-run -a node_modules/.bin/playwright test tests/e2e/knowledge/{attachments,editor-parity-assets-template,editor-parity-closeout,editor-s3-parity,comments-s4}.spec.ts --grep 'H04 上传拒绝|粘贴 / 拖入图片|从导入的本地模板新建|候选来自当前 Vault|B07 键盘|S4.*批注|选区批注' --workers=1 --retries=0`，8 项通过，退出 0。无需复跑。日志 `/tmp/huhu-w5p7-e2e.log`。
- `format:check`、`lint`、`knip`、`notices` 退出 0。全工作区 `pnpm --config.verify-deps-before-run=false --workspace-concurrency=2 -r typecheck`，退出 0。日志 `/tmp/huhu-w5p7-{format-check,lint,knip,notices,typecheck}-clean.log`。
- `pnpm --config.verify-deps-before-run=false build` 退出 0。CSS A/B/C 均为 0，桌面包扫描 43 签名、0 待处理。指定固定 OK 与 ORCA 源执行 `ok-patches.mjs --check`、`--replay`、`--replay --orca`、`--check-catalog` 退出 0。记录在 `/tmp/huhu-w5p7-{build,audit}.log`。
- B01 矩阵检查了 104 个相对行锚点，收尾端点矩阵检查了 46 个相对行锚点。逐文件结果与原始全集有相同的来源键和不适用理由。未跑全量 Electron 或性能测试。

## 待用户决定及未完成项

- 交 Lead 确认是否采用 G01 生产模块闭包分母。按原保守分母仍低于 70%。ORCA 的独立覆盖也仍不足。112 个主体未与 G01 确认对应的文件仍需核对。
- H04 批注列表读取失败目前被消费端吸收，用户无法区分空列表和加载失败。桌面平台成员差异和 Clipboard API 回退错误反馈缺独立测试。端点矩阵列有其余覆盖边界。
- 供应商用例中保留未适配条目的具体原因或链接已有部分替代证据。B01 复查中撤回的行未作为通过，见主矩阵各行。

### Modern Web Guidance

- **`accessibility`**：我用真实候选菜单验证动态错误仍通过 `role="status"` 与礼貌播报状态暴露。指南要求 “Announce dynamic errors via live regions”。
- **`accessible-error-announcement`**：我核对新建窗口在提交失败后保留输入，并用 `aria-describedby` 关联当前错误。指南要求 “list the error message in `aria-describedby` while the field is invalid”。

## Lead 验收

- 2026-11-20 Lead：G04 分母与 ORCA 闸门已由用户决定（见 user-decisions.md）。剩余：112 待定文件、ORCA ≥70%、H04 批注列表读取失败 UI 与剪贴板/桌面成员测试、B01 撤回的 94 行补断言，转 task02/新会话。
