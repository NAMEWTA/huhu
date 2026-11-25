# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1v2
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report02.md
- 业务验收报告 — [L10](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/100-l10.md)、[L11](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/106-l11.md)
- 执行结果 — blocked。两个提交交 Lead 验收，新增界面的原型覆盖缺口见下文。

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`。从已验收的 `e25b0464` 快进至登记派发的 `ca533fcba3811cbaee831935fb9dab836fbb9629`，交回 `990076be6ae4816565e14d21da73bd2ab51c214d`。两个提交通过 `git diff --check` 和暂存证据结构检查。工作树干净，验证终端已回收，本检出无残留验证进程。

逐条持有 `/home/wta/projects/huhu/temp/dev/verify.lock` 验证。锁内检查内存、父 cgroup、磁盘和 inode，以下 `pnpm` 命令均以 `volta run --node 24.22.1` 执行。类型检查沿用本检出已有的供应商声明。 [本次验证日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02)

### L10 · `9829eec567f790a067d2a7296c26884bcf560cc3`

- 改动 `apps/engine/src/boot.ts`、`plugins/ledger/huhu-plugin.json`、`plugins/ledger/src/engine/{budgets,index,reconciliation,records,references,store}.ts`、`plugins/ledger/src/shared/{money,references}.ts`、`plugins/ledger/src/ui/primitives.tsx`、`plugins/ledger/test/{fixture,references-engine.test}.ts` 及 `tests/e2e/workflows/ledger.spec.ts`。
- `ledger.references.list/open/link/unlink` 关联账本、预算或流水与当前 Vault 已有的笔记或档案。复用 Notes 与档案目录。已有稳定文档 ID 时按 ID 解析当前路径，其他资源按路径识别。已删资源显示缺失，Notes 停用显示不可用，关联可在同一账本版本上替换或解除。合并流水时迁移并去除重复关联。
- `ledger.references.previewReview/saveReview` 使用现有报表口径生成 Markdown，注明账本、业务日期及时区、币种和平账口径。保存用原版本校验，通过 `notes.create` 写入；以原调用者身份经过 Dispatcher，Notes 与档案的开放策略在调用时生效。关联存入账本事实文件，由同一写入事务维护；资源正文和文档身份由 Notes 持有。
- `pnpm exec vitest run plugins/ledger/test/references-engine.test.ts`，2 通过，覆盖真实笔记和档案、改名、回收站、停用期间记账、修复、解除、复盘保存与过期预览。 `pnpm exec vitest run plugins/ledger/test/reconciliation-engine.test.ts`，3 通过。 `pnpm --filter @huhu/plugin-ledger run typecheck`、`pnpm --filter @huhu/engine run typecheck` 均零错误。 [关联测试](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l10-references.log) · [合并回归](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l10-reconciliation.log) · [账本类型](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l10-ledger-types.log) · [引擎类型](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l10-engine-types.log)
- 待 Lead 运行 `tests/e2e/workflows/ledger.spec.ts` 中的 **L10 独立 Web 关联财务笔记并保存期间复盘，桌面可读取所写 Markdown**。该用例走真实桌面与独立 Web 的能力入口。

### L11 · `990076be6ae4816565e14d21da73bd2ab51c214d`

- 改动 `apps/engine/test/tool-access.test.ts`、`packages/workbench/src/engine-client/query.ts`、`packages/workbench/test/engine-client.test.ts`、`plugins/ledger/huhu-plugin.json`、`plugins/ledger/src/engine/{backup/index,backup/snapshot,index,recurring}.ts`、`plugins/ledger/src/shared/overview.ts`、`plugins/ledger/test/{backup-engine,reconciliation-engine,recurring-engine}.test.ts` 及 `tests/e2e/workflows/{ledger,mcp-aggregation}.spec.ts`。
- 账本包导出、预览、确认和核对可经统一目录选择开放，默认关闭。预览和恢复回执按原主体绑定。恢复保留账本级笔记关联、按模块保留流水及预算关联，重映射账本内的对象和关联 ID，保留原文档 ID 与路径。账本包预览提示正文由全 Vault 备份携带。
- `ledger.overview.activity` 从同一账本快照读取当月预算、统一计划的固定收支及贷款补记。工作台按当前 Vault 刷新相关计划与笔记查询。跨切片测试从真实 CSV 导入并在平账后比较预算、分币种报表、流水与 CSV，验证金额和余额。另一用例合并带真实笔记和贷款期次的流水，验证账本包恢复与全 Vault 恢复，回读关联、导入稳定身份、流水金额和原期次。现有账本包测试覆盖凭证和余额恢复。
- `pnpm exec vitest run plugins/ledger/test/backup-engine.test.ts`，3 通过。 `pnpm exec vitest run plugins/ledger/test/reconciliation-engine.test.ts`，4 通过。 `pnpm exec vitest run plugins/ledger/test/recurring-engine.test.ts`，1 通过。 `pnpm exec vitest run apps/engine/test/tool-access.test.ts`，4 通过，核对真实目录、HTTP/CLI 凭据、撤权、停用与预览主体。 `pnpm exec vitest run packages/workbench/test/engine-client.test.ts`，36 通过。 `pnpm --filter @huhu/plugin-ledger run typecheck`、`pnpm --filter @huhu/engine run typecheck`、`pnpm --filter @huhu/workbench run typecheck` 均零错误。 [备份](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l11-backup.log) · [报表与平账](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l11-reconciliation.log) · [固定收支](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l11-recurring.log) · [开放策略](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l11-tool-access.log) · [工作台刷新](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l11-query.log) · [账本类型](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l11-ledger-types.log) · [引擎类型](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l11-engine-types.log) · [工作台类型](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task02/l11-workbench-types.log)
- 待 Lead 运行 `tests/e2e/workflows/ledger.spec.ts` 中的 **L11 桌面切换 Vault 后使用各自的账本身份，回到原库仍可读取**，及 `tests/e2e/workflows/mcp-aggregation.spec.ts` 中的 **L11 同一 MCP 目录保留外部工具，账本按授权开放、撤权与停用**。恢复回归可复跑同一账本 spec 的 **L9 独立 Web 导出账本包并预览恢复到新账本**、**L9 桌面全 Vault 包恢复账本并按附件选项清理引用**。

## 阻碍与接续

- L0b 的已确认场景缺少财务笔记选择、打开、修复与复盘保存，以及总览的预算、固定收支、贷款卡片。L10 交付这些操作的能力；L11 交付总览数据与刷新。补齐并确认对应界面场景后，财务笔记界面可消费现有资源索引和 `requestOpenPath`，总览卡片可消费 `ledger.overview.activity`。 [L0b 用户确认范围](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/prototype-review-ledger.md)
- 核对了本机 HomiBook `5d3d71713de805c95245378408b73f101f69659a` 的来源条目。本轮复用 Huhu 既有报表、账本事务、Notes、Dispatcher 及打包接口。 [来源台账](/home/wta/projects/huhu/docs/upstream/ledger.md)
- 未运行 Electron 或独立 Web E2E、普通 CLI 实机、同一 MCP 客户端联验、HomiBook 实机、真实外部服务、Windows/macOS、视觉取证、构建、打包、全仓类型检查、全仓 lint 或 knip。按派发由 Lead 执行定向 E2E，J 系列与 SIGN 负责整体验收。

## Lead 验收
- Lead 2026-11-25：L10/L11 合入。E2E 20/21，L10 通过；L11 MCP 用例失败，返工派 task03（先 /compact）。
