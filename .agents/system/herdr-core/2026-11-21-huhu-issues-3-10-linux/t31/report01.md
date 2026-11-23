# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t31（manifest 登记），实际执行终端 t3v
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t31/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t31/report01.md
- 执行结果 — done（Linux 实施交付，集成验收待 Lead 执行）

## 结论

| 切片 | 基线分类 | 实施与验收状态 |
| --- | --- | --- |
| T1.4 原快照重试 | 缺失。基线已有原派遣幂等和不可变快照，只有 attempt 1。 | 新增工作台重试。已证实失败、结束或明确未发送后，复用 runId 与原快照，追加一次 attempt。保留原派遣及回执，并按派遣身份查询终态。新输入走新的派遣。HTTP 已验，桌面操作待集成。 |
| T4.1 最早派遣 | 部分。基线已有 UTC 持久化、扫描限制和提前确认。 | 任务编辑、详情和草稿接入最早派遣。工作台时区明确展示，回拨需选 offset，缺口提示改时间，清空保留独立截止日。HTTP 与草稿通过，桌面待集成。 |
| T5.5 改启用规则 | 部分。Engine 已保存原启停状态并重建作业，旧 UI 仍提示暂停且提交取当前查询版本。 | 旧编辑器保存所见版本，文案显示生效范围，三次后续触发使用规则时区并显示 offset。已验启用状态、原发生快照和版本冲突，桌面待集成。 |
| T7.1 生产切换 | 部分。定时、历史列表和执行槽已在持久路径，旧工作台手动调用没有版本和重查键。 | 工作台 Agent 规则立即运行按版本与意图受理，提供同键核对，扫描与模板都能重放原发生。定时与手动共用发生和 Tasks 执行槽，#6 外部会话作用域沿用现有入口。候选包门禁待集成。 |
| T7.2 任务旅程 | 部分。既有桌面 W-A、原生回执夹具及若干分段用例。 | 新增桌面定时旅程、表单与编辑冲突、W8.3 随包原生问答及双边回执签收用例。随包丢 ACK 和 Windows 原生恢复记录了跳过条件。 |

## 产物与改动

- 候选提交 `680704910ca4291f035fe3c56995419bff449f42`，父提交 `369efcfd`。工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-t5-tasks` 仍指向基准。临时索引比对业务文件一致，普通索引保留原状态。未推送。
- 证据 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/evidence/T7-cutover-linux.md`。工作树的 `.agents/` 为只读，证据通过 Git 对象加入候选树。
- Tasks 复用持久派遣、回执和任务写队列，为显式重做建立关联到原事件的新尝试。Automations 复用既有意图落盘、定时发生、模板和执行槽。任务时间输入复用跟进时区算法。
- Engine 装配单列。仅在 `apps/engine/src/boot.ts` 的 Automations 装配中按当前 Agent CLI 服务查询 Space 和 CLI 可用性，避免持续使用插件启停前捕获的服务对象。实际发送仍经 Tasks 与 Agent CLI 的预检。

## 验证

使用 Node 24.21.0、pnpm 12.10.1 和独立 `XDG_RUNTIME_DIR`，每次运行一个文件。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 原快照、明确失败或未发送、原意图重查、提前派遣、执行槽 | `pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts`，37 项通过 | `/tmp/huhu-t31-node24.gjIvtG/persistence-http.test.ts.log` |
| 最早派遣 instant 与截止日期的草稿往返 | `pnpm exec vitest run plugins/tasks/test/ui-shared.test.ts`，9 项通过 | `/tmp/huhu-t31-node24.gjIvtG/ui-shared.test.ts.log` |
| 真实定时回调、手动规则意图、改期与重开、模板和目标预检、外部权限 | `pnpm exec vitest run plugins/automations/test/task-scan-occurrences.test.ts`，29 项通过 | `/tmp/huhu-t31-node24.gjIvtG/task-scan-occurrences.test.ts.log` |
| 候选内容和业务工作树对齐 | 临时索引对比与 Git 空白检查通过 | 候选提交 |

## 未运行的验证

以下用例位于 `tests/e2e/workflows/task-journey.spec.ts`，未执行 Playwright 或 Electron。

1. **T7.2 Linux 实际定时与手动运行共享同一 Tasks 派遣，原目标不可用时可人工关闭**。桌面用秒级墙钟等待真实定时器，跨日固定时钟由 Tasks HTTP 回归覆盖。
2. **T4.1 与 T5.5 在工作台处理 DST 回拨与缺口、保留启用状态并预览三次新触发**。
3. **T7.2 候选安装包：后台到期、原生问题同会话继续、一次结果与人工完成**。需 W8.3 候选安装包、包 SHA、支持原生选择的真实 Codex 和专用测试 provider 配置，需显式启用。
4. **T7.2 候选安装包：停用 Tasks、丢失一次消费 ACK 和原生进程恢复**。随包缺少可截断内部 Agent → Tasks ACK 的验收夹具，Windows 原生恢复需 W8.3 实机。已有协议夹具可在 `plugins/agent-cli/test/native-receipts.live.test.ts` 重交回执。

候选包的干净安装、Web 邀请撤销、Vault 包还原与损坏包、窄窗和前台焦点仍待同候选集成走查。未运行打包、全仓门禁、真实 provider 或 Windows 验证。

## Modern Web Guidance

- `coordinate-global-events` 要求显式处理 DST 歧义（“Use the `disambiguation` option”）。我复用了 Huhu 已有的 IANA 候选匹配，选择后才保存 UTC instant。共享端沿用既有 date-fns 时区实现。
- `forms` 要求把说明与错误关联到受影响的输入（“Use `aria-describedby` to link inputs with help text or error messages”）。我将派遣时间的时区说明、错误和规则的时区错误关联到对应字段。

## 阻碍与接续

Linux 业务代码无阻碍。安装包签收需已合入的 W8.3 候选及所列测试环境。两项常规桌面测试可由 Lead 在本候选构建后执行。

## Lead 验收

Lead 验收（2026-11-22）：通过（含一处 spec 修正）。候选 `68070491` 合入集成 `d2601f83`；Lead 修正 `7cfed9bf`（persistence-http 测试 intent 辅助函数 dispatchId 类型，tsc 报错）与下一提交（DST 用例经后门改时区后未 reload，编辑器读到旧缓存时区 Asia/Taipei；与 acceptance.spec 同例加 reload）。Lead 补跑：tasks/automations/engine tsc、oxlint、oxfmt；vitest tasks+automations 11 文件 155/155；`pnpm build`；task-journey.spec：T7.2 Linux 定时与手动 1 过，T4.1/T5.5 DST 修正后 1 过；两个候选安装包用例按设计跳过（需 W8.3 安装包、真实 Codex/provider、Windows），未运行。
