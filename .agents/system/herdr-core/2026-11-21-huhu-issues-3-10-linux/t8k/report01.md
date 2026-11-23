# Mail 恢复与 Linux 批准撤销修复报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- Core — `wta-ubuntu`，执行者 `t8k`，Lead `t3p`
- 任务 — [task01.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8k/task01.md)
- 报告 — [report01.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8k/report01.md)
- 执行结果 — `done`，待 Lead 验收
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux` 的 `impl/huhu-issues-3-10-desktop-web-verify`，基线 `dcde4772`，本轮改动在工作树中

## 四项修复及证据

| 缺口 | 修复与实际验证 |
| --- | --- |
| 包内同地址账号 | 预检按独立源 ID 接收有效包。提交在现有地址锁内放行本批已恢复的同地址账号。目标已有同地址账号时仍逐项要求明确选择，保留原账号与本机认证。账号 ID、草稿、投递和附件的冲突检查继续执行。用例「Mail 备份内的同地址账号可按各自 ID 恢复到空 Vault」经真实子集导出、三个隔离 Vault 与恢复处理器，修复前空 Vault 两行均为 `conflict`。修复后双行按原 ID 恢复并可重试，已有账号的 Vault 只导入显式选中的一行。 |
| 已读定位重导出 | 把与已读 ID 匹配的已验证定位随现有标记文件写入同一恢复事务。导出按目标 ID、当前账号定义和文件夹重新核对定位，可在同步前生成 v2 包。标记文件的定位字段可选。用例「Mail 子集同地址须显式选择，独立 ID 与恢复结果可重开重试」删除了原先的缓存注入。修复前重开后导出 v1 且缺失定位。修复后立即导出 v2，并保留映射后的哈希及定位。既有草稿和收据写入故障、附件回滚和认证保留的断言同时通过。 |
| v1/v2 跨版本重试 | 用源账号 ID 与持久内容生成恢复指纹，标记定位可以补充或省略。跨版本重试的未映射提示核对目标已经保存的标记。参数化用例「Mail 子集从 v1／v2 恢复后更换定位版本仍识别同一独立账号」的两个方向在修复前均误报冲突。补充断言也捕获了修正指纹后提示随包版本误变的问题。最终同一目标 ID 可重试且保持两条账号记录，未映射提示符合实际保存结果。变更持久标记仍进入冲突路径，ID 被不同地址占用仍拒绝提交。 |
| Linux 桌面撤销 | 映像核对失败时，桌面 review 返回已有批准 ID、可见原因及 `target: null`。现有对话框禁用批准动作，按原 ID 提交撤销。签发与外部读取、运行仍走严格映像核对。用例「Linux sh 外部批准固定映像、版本、工作目录和单次启动」模拟 `/bin/sh` 解析失败，修复前桌面 review 返回 `PERMISSION_DENIED`。修复后桌面撤销成功，外部 review/status/run 和新的批准仍拒绝，恢复映像解析后原批准依旧已撤销。 |

已提交的 v1 独立恢复通过 v2 重试时，返回原账号及实际未映射数量。修复前已经写下完整 v2 指纹的记录，可用含原定位的包精确回查。

## 实际运行

- `plugins/mail/test/outbox-engine.test.ts` 四项相关用例通过，其余 11 项在定向运行中跳过。最终命令为 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Mail 子集|Mail 备份内' --maxWorkers=1`。
- `plugins/automations/test/service.test.ts` 34/34 通过。命令为 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/automations/test/service.test.ts --maxWorkers=1`。
- Node 24.21.0 下逐文件运行，每次只运行一个 Vitest 文件。首次 pnpm 自动校验依赖时尝试联网安装，因 DNS 受限中断。之后从根锁文件相同的集成工作树恢复本工作树的本地依赖目录，关闭自动安装再运行。
- `oxfmt --check --threads=1` 对下列 11 个文件通过，包含独立审查标出的六处格式。`git diff --check` 通过。
- 前端执行了 Modern Web Guidance 的 `confirmation modal dialog` 检索和 `dialog,html,accessibility` 获取，沿用现有 Dialog、原生按钮和状态提示。

## 未运行的验证

- 尝试运行 Mail 文件其余用例时，首项「确认清理隔离旧同步，重开后保留已读覆盖、附件、认证和未知投递」在夹具启动时遇到 `listen EPERM: operation not permitted 127.0.0.1`。`--bail=1` 停止，余下业务测试留给 Lead 在可监听回环的环境运行。
- Electron/Playwright 留给 Lead 串行运行。新增用例「Linux 桌面对话框在系统 sh 无法核对时仍可撤销原批准」模拟渲染器收到的 review 响应，批准创建和撤销由实际 Engine 处理。映像解析失败和外部拒绝由上面的 Vitest 验证。 [automation-linux-approval-revoke.spec.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/workflows/automation-linux-approval-revoke.spec.ts:6)
- 真实 Linux CLI/MCP/Core 启动、Windows PowerShell、Mail 桌面与 Web 走查、全仓类型检查、lint、knip、全量测试、Go、构建与打包均留给 Lead。

## 文件清单

- `plugins/mail/src/engine/accounts.ts`
- `plugins/mail/src/engine/message-cache.ts`
- `plugins/mail/src/engine/read-overrides.ts`
- `plugins/mail/src/engine/subset-data.ts`
- `plugins/mail/test/outbox-engine.test.ts`
- `plugins/automations/src/engine/approved-linux-shell.ts`
- `plugins/automations/src/engine/terminal-environment.ts`
- `plugins/automations/src/ui/TerminalApproval.tsx`
- `plugins/automations/src/ui/TerminalEnvironment.tsx`，格式
- `plugins/automations/test/service.test.ts`
- `tests/e2e/workflows/automation-linux-approval-revoke.spec.ts`，新增

## 回告

`HC_TERMINAL_ID=t8k` 与任务清单一致。`hc get t3p` 返回 Core 锁文件系统只读。以共享报告交回工作树，后续 Linux 启动恢复由 Lead 重新分配。

## Lead 收取
保存 cda0aa30 并合入 c1b5cd39；启动 Lead 完整受影响单文件验证 t8x（以实际HC地址为准）。尚有同地址双账号部分成功后原参数重试的风险交 task02 核对。Automations写入归属已交t86/task02。
