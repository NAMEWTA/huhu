# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report02.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{009-f14,004-f08,011-f21}.md
- 执行结果 — done，交 Lead 验收

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，基线 `ceacca5e`，交回版本 `6441eecf8420b26f44199abfd4f3113a331f25ea`。三个独立提交均含 `Refs: #13`，工作树干净，`git diff ceacca5e..HEAD --check` 通过。以下定向测试共 8 个文件、68 项通过，逐文件持共享锁执行，结果来自 Herdr Core 终端。

### F14 · 38b0e848cd5e143bd73d80a155afce9ad0c59b2b

- 改动文件 — `apps/engine/src/boot.ts`、`packages/contracts/src/events.ts`、`packages/vault/src/watch/watcher.ts`、`plugins/notes/src/engine/index.ts`、`plugins/versioning/src/engine/{history,index,pending-history,sync}.ts`、`plugins/versioning/test/pending-history.engine.test.ts`、`tests/e2e/shell.spec.ts`。
- 保存后冻结实际提交字节及版本，外部观察冻结已核对的字节。待记录项持久化至 Vault 状态目录中的 `history/pending`，去抖期间合并相邻的同来源修订。正常退出、切库和停用排空已收集的文件事件及 Git 工作，shadow Git 从冻结字节提交并保留原发生身份，以便在 Git 写入与清理回执之间中断时重试。失败通过站内通知提示，保留队列自动重试，重开或重新启用也会恢复。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/versioning/test/pending-history.engine.test.ts`，2 项通过。真实 Engine 保存后立即退出或停用，真实 Git 引用锁、外部改写，以及模拟提交完成后清理回执前中断。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/versioning/test/history.test.ts`，12 项通过。含历史去重、命名检查点、改名、中文路径与恢复保护。
- Lead E2E — `tests/e2e/shell.spec.ts`，`文件历史：保存后立即切出 Vault 或关闭，重开只记录一次末次修订`。

### F08 · 26558801c3549dab16edec1d37eddda388e21a42

- 改动文件 — `plugins/inbox/src/{engine/service.ts,ui/InboxModule.tsx}`、`plugins/notes/src/engine/{index,service}.ts`、`plugins/notes/test/domain-exposure.engine.test.ts`、`tests/e2e/knowledge/compact-inbox.spec.ts`。
- 转换界面预填并允许编辑字面 Markdown，提交带原捕获版本。公开工具省略正文时从源捕获取值，显式空字符串创建空白内容。正文由 Notes 领域在目标文件首次写入时携带。源捕获正文和转化结果 ID 保留，目标笔记双链进入反链索引。选择非空白笔记模板时，非空正文附在模板后。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/notes/test/domain-exposure.engine.test.ts`，11 项通过。CLI 与 HTTP MCP 覆盖默认、编辑和清空正文、目标磁盘字节、源关系、反链和转换回执。初次运行的断言把造数时的桌面捕获回执算入转换回执，按能力边界收窄断言后通过。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/inbox/test/service.test.ts`，9 项通过。
- Lead E2E — `tests/e2e/knowledge/compact-inbox.spec.ts`，`桌面与 Web 将捕获的 Markdown 直接写入笔记并保留关联`。

### F21 · 6441eecf8420b26f44199abfd4f3113a331f25ea

- 改动文件 — `apps/desktop/src/renderer/workbench.tsx`、`packages/kernel/src/capabilities/vault.ts`、`packages/vault/src/index/{search,vault-index}.ts`、`packages/vault/test/vault-index.test.ts`、`packages/workbench/src/command-palette/{CommandPalette.tsx,palette-model.ts}`、`packages/workbench/src/state/ui-store.ts`、`packages/workbench/test/{palette,ui-store}.test.ts`、`plugins/inbox/src/ui/{InboxModule.tsx,index.tsx,open-capture.ts}`、`plugins/inbox/test/open-capture.test.ts`、`tests/e2e/workflows/acceptance.spec.ts`。
- 索引随结果传任务或捕获的语义 ID，笔记选中后传字面路径。复用现有模块请求，离场守卫批准且 Engine 仍匹配后再投递。当前模块已打开时直接接收请求，收件定位按 Engine 客户端隔离。输入、开关面板、客户端替换时中止旧请求，并在旧传输仍返回的情况下丢弃结果。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/vault/test/vault-index.test.ts`，22 项通过。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/ui-store.test.ts`，7 项通过。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/palette.test.ts`，4 项通过。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/inbox/test/open-capture.test.ts`，1 项通过。
- Lead E2E — `tests/e2e/workflows/acceptance.spec.ts`，`命令面板：桌面和 Web 按命中身份打开任务、收件项与带井号的笔记`、`命令面板：清空或关闭后丢弃迟到结果，取消离场不残留目标请求`。

## 未运行的验证

- 上述四个 Playwright 用例、F14 从独立 Web 保存后的关停，以及 F21 真实 Engine 换代期间的浏览器表现待 Lead 验证。F14 重启恢复用例模拟了提交与清理回执的中断点。
- 类型检查按项目规定由 Lead 串行执行。受影响的包为 `@huhu/contracts`、`@huhu/vault`、`@huhu/kernel`、`@huhu/workbench`、`@huhu/plugin-versioning`、`@huhu/plugin-inbox`、`@huhu/plugin-notes`、`@huhu/engine` 和 `@huhu/desktop`。

## 阻碍与接续

当前提交可交 Lead 审查。本批启动的定向测试终端已回收。

## Lead 验收

- Lead 2026-11-24：合入 main bf82c8fe，9 包类型检查通过，E2E 4/4 通过。清单转 task03。
