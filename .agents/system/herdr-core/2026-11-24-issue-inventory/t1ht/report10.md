# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task10.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task10.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report10.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{102-p5,039-l1,065-l2}.md
- 执行结果 — done

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，起始提交 `134703b7`。运行原件目录为 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task10/`。

### 最先执行 · 修复 MCP 聚合回归

- 独立提交 `f18f6e5ae3cbef4b10be28658ede016ecb91eaa5`，提交后已通过 `hc send t1hr` 回告。
- P2 的内联 header 在 P4 凭据宿主可用时可以安全导入。用例改用仍明确拒绝的 URL 内嵌凭据，四项状态、脱敏、未运行来源及撤权断言均保留。`tests/e2e/workflows/mcp-aggregation.spec.ts`。
- 共享 `Dialog.tsx` 在 `showModal()` 后聚焦调用方指定的按钮。许可和开放策略确认均先聚焦「取消」。文件包括 `packages/ui/src/components/{Dialog.tsx,ui.tsx}` 与 `packages/workbench/src/gateway/McpSourcesPanel.tsx`。
- `McpSourceDialogs.tsx` 区分 stdio 与远端表单字段实例，避免切换后远端 header 沿用 stdio 参数框的 `[]`。OAuth 用例新增远端 header 默认为 `{}` 和保存关闭的断言。
- 持锁运行 `volta run --node 24.22.1 pnpm --filter @huhu/desktop run build` 成功，原件 `regression-build.log`。持锁运行 `env -u WAYLAND_DISPLAY HUHU_MCP_KEYRING_ACCEPTANCE=1 XDG_SESSION_TYPE=x11 ELECTRON_OZONE_PLATFORM_HINT=x11 xvfb-run -a volta run --node 24.22.1 pnpm e2e tests/e2e/workflows/mcp-aggregation.spec.ts`，5 条全部通过（48.0 秒），含真实本机凭据宿主和回环 OAuth。运行后未发现残留 Electron 或 stdio 夹具进程。原件 `regression-e2e.log`。
- `@huhu/ui`、`@huhu/workbench` 包级类型检查零错误，原件 `regression-{ui,workbench}-typecheck.log`。

### 102-p5 · 连接恢复、停用回收与会话一致性

- 独立提交 `47617e72`。`packages/kernel/src/mcp-sources/{runtime,transport,stdio,credentials}.ts` 管理当前 Vault、发布作用域和配置指纹下的共享连接。断开后按 250 ms、1 s、3 s 尝试三次连接和目录发现。耗尽后从管理入口手动重连。目录查询等待单一慢来源最多 750 ms，业务调用有独立预算。发布关闭后清除长连接、重试等待和已启动的临时检查。显式短期检查仍可运行，结束后关闭自身连接。POSIX stdio 按所属进程组关闭，stderr 只排空。认证续订沿用同源合并并关联连接取消。
- `packages/kernel/src/{gateway-audit,capabilities/system}.ts` 在现有审计入口补充上下游条目标识、来源、会话和主体摘要、调用关联 ID、操作、结果和修订。资源标识写摘要。调用已发出后失联返回未知结果及审计关联 ID，重连只重新发现目录。
- `packages/kernel/test/mcp-sources.test.ts` 和 `tests/fixtures/mcp-stdio.cjs` 验证真实 HTTP 会话共用一个长期子进程、崩溃/阻塞隔离、未知结果无重放、退避耗尽、回环防护、恢复主体与令牌撤销、发布停止后回收检查与所属子进程。
- 定向测试通过 `packages/kernel/test/mcp-sources.test.ts` 14 项、`packages/kernel/test/mcp-recovery.test.ts` 3 项、`packages/kernel/test/mcp-routing.test.ts` 14 项、`packages/kernel/test/dispatcher.test.ts` 29 项。原件 `p5-{mcp-sources,mcp-recovery,mcp-routing,dispatcher}.log`。`@huhu/kernel` 包级类型检查零错误，原件 `p5-kernel-typecheck.log`。

### 039-l1 · 建账后能重开使用

- 独立提交 `5d76e4fb`。`plugins/ledger/{package.json,huhu-plugin.json,UPSTREAM.md,src/engine,src/shared/books.ts,src/ui/index.tsx}` 接入正式插件生命周期、静态能力和共享工作台。Engine 装配在 `apps/engine/{package.json,src/boot.ts}`，桌面/独立 Web 装配在 `apps/desktop/{package.json,electron.vite.config.ts,src/renderer/workbench.tsx}`，账本状态刷新接入 `packages/workbench/src/engine-client/query.ts`。
- 建账和首个账户一并提交，当前选择写入各自 Vault。支持重命名、归档、恢复、按版本和完整名称确认删除。持久事实位于 `.huhu/ledger/`，账本 owner 复用 `VaultFiles` 和 `OperationLog`。只读工作台可暂时切换所见账本。
- `plugins/ledger/test/books-engine.test.ts` 通过 2 项，验证 Vault A 重开/选中/停用恢复、Vault B 隔离、只读、删除版本及归档。原件 `l1-books-final.log`。包级类型检查 `@huhu/plugin-ledger`、`@huhu/engine`、`@huhu/workbench`、`@huhu/desktop` 零错误，原件 `l1-*-typecheck.log`。

### 065-l2 · 账户与记账闭环

- 独立提交 `2f8ebcb4`。`plugins/ledger/src/{engine,shared/entries.ts,ui}` 和 `huhu-plugin.json` 实现账户、类型/银行/分类/标签字典、期初与日初校准历史，收入/支出/同币种与跨币种转账、复制、筛选分页和分币种汇总、版本化批量修改/删除。转账是同一事实记录，两端余额共用一个提交。历史归档对象可读，新引用仍需可用。总览、流水、账户及全局「记一笔」沿用共享 Workbench。
- `plugins/ledger/src/engine/attachments.ts` 将最大 2 MiB 的凭证放入账本受管目录，在同一日志操作内写入二进制和版本化引用。重开后可编辑、克隆复用同一凭证，并报告缺失。预览核对当前版本，测试注入第一步发布后的故障并检查无孤儿文件。逐项来源与 HomiBook 固定提交的关系记录于 `plugins/ledger/UPSTREAM.md`。
- `plugins/ledger/test/entries-engine.test.ts` 通过 5 项，验证 95/125、全筛选结果分页汇总、跨币种双端筛选、写入故障和写者竞争无半笔、字典归档、批量变更、凭证回滚/恢复/克隆/缺失。原件 `l2-entries-engine-final.log`。再次通过 `plugins/ledger/test/books-engine.test.ts` 2 项和 `packages/contracts/test/ledger.test.ts` 13 项。原件 `l2-{books-engine,ledger}.log`。
- 包级类型检查 `@huhu/plugin-ledger`、`@huhu/engine`、`@huhu/desktop` 零错误，原件 `l2-*-typecheck.log`。

### 验证命令和待运行验证

- 上述每个单测文件分别运行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <测试文件>`。包级检查分别运行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter <包> run typecheck`。启动前核对 12 GiB 可用内存门槛，桌面构建及 E2E 启动前核对 20 GiB 门槛。各级 cgroup 无更严内存上限，涉及的磁盘卷余量约 141 GiB。
- Lead 执行 `tests/e2e/workflows/ledger.spec.ts` 的三个用例：「L1 桌面创建两本账，重开 Vault 后保留选择和删除预览」「L1 独立 Web 工作台建账，桌面打开同一 Vault 的账本」「L2 收入、支出与转账得到 95/125，带凭证流水重开后可编辑」。本 worker 只写用例。
- 建议 Lead 在整合版本上重跑 `tests/e2e/workflows/mcp-aggregation.spec.ts`。本次 5/5 的 E2E 原件对应最先执行的回归修复。P5 的最终运行证据为上述四个定向测试文件。
- 未运行 Windows 进程树和真实第三方 MCP/provider 验证。Windows 沿用当前 SDK stdio 关闭逻辑。本轮未执行账本构建、全仓验证、lint、打包或视觉取证。

## 阻碍与接续

- 新 workspace 包 `@huhu/plugin-ledger` 使用仓库已安装版本，Engine/Desktop 新增 workspace 引用。需要 Lead 更新根 `pnpm-lock.yaml` 后，干净检出才可通过 frozen install。按派发约定，本分支未改锁文件。worker 的本地验证复用了现有模块并临时建立 workspace 链接，后续命令设置 `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` 跳过依赖自检。初次 pnpm 自动依赖检查启动后已中止，输出为 `downloaded 0, added 0`。已核对版本库中的锁文件无变更。
- 账本凭证通过桌面/Web 共用的浏览器文件选择器和账本能力传输，浏览器端只提交文件字节。只验证本地受控夹具。账本导入、正式平账和备份等后续票据功能未纳入本批。

## Lead 验收


- Lead 2026-11-25：P5/L1 通过，L2 E2E 失败转 task11；Lead 更新锁文件。清单转 task11。
