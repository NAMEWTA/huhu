# 永久知识与附带 change 收尾报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- terminal_address — `t1d5`
- Lead — 本机默认 Core 的 `t3p`，CLI `hc 0.1.21`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d5/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d5/report01.md`
- 执行结果 — `done`
- 代码依据 — 2026-11-23，`/home/wta/projects/huhu` 的 `main@fc43ceef5b64ca1c9a68404c9110a6ca46883034`。Lead 同步 `0.0.2-rc.1` 的工作树元数据独立进行。

## 永久知识

| 现役归属 | 更新内容与证据 |
| --- | --- |
| [任务与自动化](../../../../dev/notes/context/tasks-and-automations.md) | Markdown 仍是 schema 2，schema 1 仍由仓储登记问题。旧 `markDispatched`、`tasks.comment.system` 与 Safe 环境引用以现役派遣、绑定和回执路径取代。核对 `TaskExecutionSchema`、`TasksService.update/recordDispatchAccepted`、`TaskDispatch`、`TaskReceiptInbox` 与受保护终端审批。保留人关闭、评论独立、未知送达和按会话记录清理的约束。 |
| [智能体启动](../../../../dev/notes/context/agent-launch.md) | 更新共用的 `resolveAgentLaunch`、每 Vault 设置、新会话与原生历史的参数差别、当前标签收纳和纯布局恢复。明确普通环境与受保护值的适用范围，用 `interactive-environment.ts`、`sessions.ts`、`workspace-package.ts` 核对原生历史和布局边界。 |
| [知识库编辑器](../../../../dev/notes/context/knowledge-editor.md) | `DocumentSession` 按版本保存并识别本次写入通知，手动保存、退出草稿、未确认回执及停放后刷新各有机制。以逐事务交付和 800 ms 自动保存取代旧的编辑交付防抖描述。以 `DocumentSessionRegistry`、`useFlushedMode` 和 `notes.save` 核对视图、会话、版本和草稿边界。 |
| [设计系统](../../../../dev/notes/context/design-system.md) | 更新 H02 守护说明。映射已移入 `vendor.ok-host`，`check-ok-class-collisions.mjs` 对 A、B、C 都能报失败。保留构建规则与实际渲染是两项不同证据。 |
| [工作台](../../../../dev/notes/context/workbench.md) 与 [知识索引](../../../../dev/notes/index.md) | 补桌面及 Web 宿主、共享看板和退出回执。Safe 与 Mail、Git HTTPS、Agent CLI、Automations 的运行凭据分别归属。按 `module-credential-host.ts` 核对系统后端和本机实例绑定。按 `graph-mail.ts` 与 `message-cache.ts` 核对旧信回 Inbox 只更新列表，增量证实的新未读邮件才能通知。区分线上、跨设备、其他平台和真实输入法的未验证范围。#7 暂停，#11 和 #12 在本批范围外。 |

本批范围与已有运行结果核对 [program.md](../../../../dev/changes/2026-11-19-huhu-issues-3-10/program.md) 和 [非 SSH 交付](../../../../dev/changes/2026-11-19-huhu-issues-3-10/evidence/non-ssh-final-delivery.md)。后者的固定应用及驱动为 `f6c4e0d5`，已核对是 `fc43ceef` 的祖先。该证据覆盖所列非 SSH 流程和 Graph，适用范围不含 #2 的完整历史验收。

## 附带 change 归档建议

### 2026-11-18-issue2-closeout

**建议保留在 changes。** GitHub #2 当前为 `closed`，API 原因为 `completed`。事件时间线显示 2026-11-19 17:52:35 UTC 首关、17:54:33 UTC 重开，2026-11-20 09:45:08 UTC 再次关闭（台北时间 11-20 17:45:08）。关闭评论明确是维护者决定结束开发。它取代了 reopened 文档里“保持开放”的 Issue 状态。 [GitHub #2](https://github.com/NAMEWTA/huhu/issues/2) · [维护者关闭说明](https://github.com/NAMEWTA/huhu/issues/2#issuecomment-7036301960)

后续 `38cc28f` 合入并发改名、编码转换和源码撤销保护，`e58586c` 合入 `57a9f8b` 的引用块加载、端点核对和证据增补。两个合入提交均在本次基线历史中。`7811141b` 已保留旧 Herdr 协作记录，当前 change 目录仍在原处。 [复审阻断补充](https://github.com/NAMEWTA/huhu/issues/2#issuecomment-7036547529) · [最后一批补充](https://github.com/NAMEWTA/huhu/issues/2#issuecomment-7038851587) · [最后一批执行报告](../../../herdr/2026-11-18-issue2-closeout/rest/report01.md)

证据只部分取代 reopened 结论。最终构建记录显示 A/B/C 为零，源码守护亦已纠正 A 的旧分类口径。相同候选 `57a9f8b` 的全量 E2E 原始日志仍为 **293 通过、22 失败、7 跳过**，其中 OP-D05 实际浮层和 B01 镜像/画板场景均失败，22 项未逐项分诊。G07 富格式 Inbox 正文冷启动对照、H02 对 rc.4 的视觉矩阵、F09、H05 成本与固定 OK 对拍仍缺最终结果。reopened 的候选曾量得 G07 正文配对差中位 **+782 ms**，后续普通正文改用轻量入口属于代码进展，现有证据未给出同口径复测。2026-11-23 固定包的非 SSH 联验也未覆盖这些条款。建议保留 change 及未通过的证据，后续如维护者明确接受遗留验收范围，再据实际处置归档。 [reopened 验收](../../../../dev/changes/2026-11-18-issue2-closeout/evidence/reopened/README.md) · [候选标识](../../../herdr/2026-11-18-issue2-closeout/final1/build-info.json) · [门禁摘要](../../../herdr/2026-11-18-issue2-closeout/final1/status.tsv) · [本机原始 E2E 日志](../../../herdr/2026-11-18-issue2-closeout/final1/e2e-full.log)

### 2026-11-19-github-issue-source

**建议归入 `archive/changes/implemented/process_2026-11-19-github-issue-source/`。** 原交付为当前会话按需读取 GitHub Issues。现行 `source.scope` 为 `NAMEWTA/huhu`，`monitor.mode` 为 `manual`。实际执行只读 `gh issue list`、`gh issue view 2` 与 `gh api` 回读，列表来自配置仓库，Issue #2 对象 ID 两个入口一致（`I_kwDOVmq61M8AAAABfPBmRQ`）。归档目标当前无同名目录，现役入口仍在项目配置与根指令。 [原验收](../../../../dev/archive/changes/implemented/process_2026-11-19-github-issue-source/evidence.md) · [现行读取方法](../../../../dev/project/issue-automation/README.md) · [现行配置](../../../../dev/project/issue-automation/configuration.yaml)

## 本次验证与范围

- `git diff --check -- .agents/dev/notes` 通过。逐个核对本次六份 Markdown、仓内链接和标题锚点。改动均在既有 notes，另发布本任务报告。
- 仓库 oxfmt 配置忽略 `.agents/**` 与 Markdown，定向格式命令因此未匹配文件。首次 `pnpm exec` 自动同步了本机 `node_modules`，`pnpm-lock.yaml` 无改动。采用 diff 与链接检查完成文档验收。
- 本次未运行单元测试、E2E、构建、打包、全仓类型检查或运行时实测。上文运行结果来自已保存的候选证据。
- 两个 change 均只读核对。未修改 Issue、移动 change、提交代码或创建 worktree。

## Lead 验收

Lead 2026-11-23：已读报告并核对关键代码定位；接受确定缺口，暂缓相应 Issue 关闭。文档结果与后续补齐同步，不把原总结视作无缺口证明。
