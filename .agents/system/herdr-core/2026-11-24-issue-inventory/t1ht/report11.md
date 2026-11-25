# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task11.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task11.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report11.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{065-l2,082-l3,083-l4}.md
- 执行结果 — done

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`。L2 修复前快进 main 至 `a4f867dc`。Lead 合入修复并登记依赖后执行 `git merge main`，快进至 `042fd6a3`。运行原件目录为 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task11/`。

### 065-l2 · 修复账户类型选择器

- 独立提交 `e47ecd0c`，结果已先通过 `hc send t1hr` 回告。Lead 此后已将提交合入 main。
- `plugins/ledger/src/ui/primitives.tsx` 将关联标签移到控件旁边，继续通过 `for`/`id` 绑定。原先嵌套的下拉选项属于标签子树，Playwright 读取标签文字时也读到选项，导致精确匹配「账户类型」失败。复验前未调整 E2E 断言。
- 持锁执行 `volta run --node 24.22.1 pnpm --filter @huhu/desktop run build` 通过，原件 `l2-build.log`。持锁执行 `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 ELECTRON_OZONE_PLATFORM_HINT=x11 xvfb-run -a volta run --node 24.22.1 pnpm e2e tests/e2e/workflows/ledger.spec.ts`，当时的 3 条全部通过（20.5 秒）。覆盖 L1 桌面与独立 Web，L2 两账户 95/125 及重开后编辑带凭证的流水。原件 `l2-e2e.log`。无残留 Electron。
- `@huhu/plugin-ledger` 包级类型检查零错误，原件 `l2-typecheck.log`。

### 082-l3 · 历史账单导入与导出

- 独立提交 `1528dd08`。Lead 登记依赖后持锁运行 `volta run --node 24.22.1 pnpm install --frozen-lockfile --prefer-offline`，通过，原件 `l3-frozen-install.log`。工位复用锁定版本，未修改锁文件或使用依赖检查绕过。
- `plugins/ledger/src/engine/{import-parsers,imports,csv-export,records,store,index}.ts` 与 `src/shared/imports.ts` 复用 d3-dsv 和 SheetJS，读取支付宝及京东 UTF-8/GBK CSV、未加密微信 XLSX、通用 CSV。可手工指定通用 CSV 表头、列号和类型值。预览保留行号、来源日期与账本业务日，处理账户/分类映射、无法解释的方向、歧义时间和疑似重复。可明确选择保留同金额同日的真实独立消费。预览 15 分钟有效，取消只清理暂存。确认绑定 Vault 内的账本、文件摘要、映射版本、预览及原行标识。入账和持久回执一起提交，重开可查回。
- `plugins/ledger/src/ui/{ImportWizard,Records,RecordEditor,primitives}.tsx` 接入共享工作台向导、映射保存、逐行处理、选择和取消。报告待匹配的账户名称，可在资金账户页建立缺失账户后重新预览。CSV 导出复用明细筛选谓词和顺序、包含全量命中记录。桌面走宿主保存，独立 Web 使用下载。
- `docs/upstream/ledger.md` 和 `plugins/ledger/UPSTREAM.md` 已记录 [SheetJS CE 0.20.3 官方发布包](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz)、锁中完整的 sha512 摘要及 Apache-2.0 许可。样本放在 `tests/fixtures/ledger/`。
- 定向 `plugins/ledger/test/import-engine.test.ts` 3 项和 `plugins/ledger/test/entries-engine.test.ts` 5 项通过。覆盖 GBK/XLSX、退款方向、含多行字段的实际文件行号、业务日转换、取消、过期映射、并发及重开幂等、真实重复消费、全筛选导出、归档展开上限和表格公式防护。日志 `l3-{import-engine,entries-engine}.log`。`@huhu/plugin-ledger` 类型检查零错误，原件 `l3-typecheck.log`。

### 083-l4 · 去重与平账

- 独立提交 `949b8393`。`plugins/ledger/src/engine/{reconciliation-matches,reconciliation,records,store,index}.ts` 和 `src/shared/reconciliation.ts` 实现同分钟等默认去重规则、可调整的范围/时间精度/账户/交易方与备注相似度。提供保留行、账户及分类冲突、备注审阅、附件与笔记/期次关联预览，提交时重验账本和成员版本。
- 平账可指定锚点或自动查找，同币种且金额精确相等时先列一对一，再列至多五笔的反向组合。保留原流水，收支统计排除整组，资金余额继续使用实际流水。整组撤销恢复收支统计。平账中的流水可维护备注等元数据，变更金额、账户、日期或方向须先撤销整组。相异计划期次不可合并，避免丢失独立业务事实。
- `plugins/ledger/src/ui/{ReconciliationDialog,Records,RecordEditor}.tsx` 提供查找、选择、预览、合并、平账和整组撤销。`huhu-plugin.json` 同步静态能力。合并把受管凭证、导入行及稳定笔记/期次关联迁到保留行，真实笔记与期次消费者留给 L11 联验。
- 定向 `plugins/ledger/test/reconciliation-engine.test.ts` 3 项通过，覆盖 100 对 60+40、跨账户余额保持、撤销、成员编辑、版本过期、附件实际读取及笔记/期次合同夹具。L4 再跑 `entries-engine.test.ts` 5 项、`import-engine.test.ts` 3 项和 `books-engine.test.ts` 2 项通过。原件 `l4-{reconciliation-engine,entries-engine,import-engine,books-engine}.log`。`@huhu/plugin-ledger` 类型检查零错误，原件 `l4-typecheck.log`。

### 验证命令和待运行项

- 每个定向用例文件分别以 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <文件>` 执行。每次包级检查使用 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/plugin-ledger run typecheck`。验证前检查可用内存、cgroup 及磁盘，单测/类型检查阈值 12 GiB，安装/构建/E2E 阈值 20 GiB。磁盘余量约 141 GiB。
- Lead 执行 `tests/e2e/workflows/ledger.spec.ts` 新增的「L3 独立 Web 导入四种账单、保留真实重复消费并导出筛选结果」和「L4 跨账户平账保持资金余额，撤销后恢复统计并可预览合并重复流水」。新增用例已做 Node 语法检查。本 worker 仅执行任务特许的 L2 修复 E2E。
- L3/L4 未运行桌面构建、浏览器验收、全仓检查、打包或视觉取证。样本为本地匿名夹具，未使用真实支付账户。

## 阻碍与接续

无实施阻碍。L3/L4 的共同宿主验收和 L11 的真实笔记/期次联验待对应验收阶段执行。

## Lead 验收


- Lead 2026-11-25：L3/L4 合入 main cb2145ae，ledger.spec 5/5 通过。该会话上下文 81%，验收后回收，新会话接续。
