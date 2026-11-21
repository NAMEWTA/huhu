# 冻结候选独立复验 05

审查对象 `7ff591a0ff797c3205e50a3d788173c783164723`。OAuth 的原报告 P2 在指定场景下可关闭。W5 有两项 P2，均涉及用户选中的历史记录与实际交给 CLI 的记录可能不一致。

## 阻断项

### P2 · Claude / Codex 恢复和分支未绑定选中的原生存储

历史扫描从 Engine 环境取根目录。历史启动使用各 provider 保存的环境覆盖，且给 Claude 或 Codex 的原生引用只有 ID。用户设置 `CLAUDE_CONFIG_DIR` 或 `CODEX_HOME` 后，选择 A 库的记录可向 B 库发出恢复或分支命令。若 B 库有同 ID 的副本，启动可能打开 B 中的记录。恢复登记仍保留 A 的 Huhu 历史 ID，导致活动标记和 Pane 看起来归属于 A。对当前 Space 的记录计数只证明该查询范围内的唯一性。另一 Space 的同 ID 文件以及扫描上限之外的文件都可能漏出这个检查。 [扫描根目录和上限](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/history/scanner.ts#L188) [引用与启动](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L570) [原生参数与环境](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/launch.ts#L109) [启动绑定与 Core 调用](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L481)

独立探针在临时目录建立两套合成 Codex 库。同一 UUID 在两库解析为不同的 `historyId` 和标题，恢复与分支的启动解析却都返回 B 的 `CODEX_HOME` 和该 UUID。另一个同 ID 样本在单 Space 只计到一条，扩大范围计到两条。Claude 的两种启动解析也转发设置中的 `CLAUDE_CONFIG_DIR` 和选中 ID。实际运行到哪一份历史属于 CLI 行为，本探针只执行了冻结扫描器和参数解析器。验收时应能证明所选记录在 CLI 实际查找的存储里可唯一寻址，或在发送启动请求前拒绝动作。 [W5.2 验收](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W5.2-history-restore.md)

### P2 · 同路径、同 Pi 会话 ID 的文件替换保留旧历史身份

Pi 的 `historyId` 由 provider、原生 ID、规范路径和 cwd 组成。启动前的两次复查使用同一组字段。列表打开后若一次归档还原用另一个文件替换原路径，且保留原 header，旧选择仍通过检查。预览会读到替换件，恢复和分支也会把替换件所在路径交给 Pi。 [Pi 身份与复核](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/history/scanner.ts#L171) [预览按引用读取](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L655) [首次检查](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L481) [发送前复查](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L524) [Pi 参数](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/launch.ts#L152)

独立探针先在原 JSONL 追加 `thinking_level_change`，同一文件的旧引用仍有效。随后移走原件并在同路径写入相同 header、不同消息的新文件。Windows 文件索引号不同，旧 `historyId` 保持不变，复查仍返回 `true`，按旧引用读取时得到替换消息。验收需同时覆盖两种情况，允许原件正常追加，并让已换文件的旧选择失效。

## OAuth 终态与 Main ACK

- **重启和原会话回读。** 原 ID 与原发起键都经过同一终态解析。已经写入回执的结果保留原会话和账号。回执写入在凭据发布后失败时，受理记录仍挡住重放。重启后只从索引指定账号的已发布凭据代中核对原 `sessionId`。命中后恢复原 `configured`、`accountId`、`smtp` 并尝试补回执。交换已登记而证据不足时，同一 ID 返回 `unknown / commit-unconfirmed`。 [终态解析](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts#L151) [凭据提交证据](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts#L150) [发布后回执故障断言](../../../../../temp/issue-worktrees/integration/plugins/mail/test/oauth-engine.test.ts#L776)
- **证据归属。** 受理主体和索引归属绑定物理 Vault 实例，实例来自逻辑 ID 与物理目录标识。补查要求已发布凭据包含准确的原授权会话 ID，续期保留这一证据。测试覆盖同地址另有账号仍待核实、重新授权在定义发布前失败仍待核实，以及复制 Vault ID 与 ledger 后原 ID 返回 `NOT_FOUND`。 [物理实例](../../../../../temp/issue-worktrees/integration/apps/engine/src/module-credential-host.ts#L61) [续期](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-provider.ts#L160) [Vault 和同地址断言](../../../../../temp/issue-worktrees/integration/plugins/mail/test/oauth-engine.test.ts#L824)
- **Main ACK。** 5 秒超时及发送 IPC 抛错产生 `unconfirmed`，原回调监听继续由同一 OAuth 会话持有，直到回调或会话结束。明确拒绝仅在仍等待时触发 `browser-unavailable`。桌面用例用合成的 5.5 秒延迟 ACK 验证原监听仍接受 HTTP 请求，另外验证明确拒绝的状态。 [Engine 对 Main 回执的处理](../../../../../temp/issue-worktrees/integration/apps/engine/src/main.ts#L37) [授权监听](../../../../../temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts#L328) [桌面用例](../../../../../temp/issue-worktrees/integration/tests/e2e/workflows/mail.spec.ts#L65)

## W5 其余复核

- 扫描按规范化 cwd 和 Space 根筛选，provider、查询文本、活动状态与分页在服务端应用。重叠 Space 根只产生一条相同物理引用。预览重扫后按选中的引用读取具体路径，响应不暴露该文件路径。坏记录只返回合计，界面显示请求忙碌和截断状态，W5.1 约定的坏记录原因与扫描进度仍缺直接呈现。 [扫描与去重](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/history/scanner.ts#L223) [列表与预览](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L620) [历史面板](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/ui/history/HistoryPanel.tsx#L218)
- Pi 启动先对实际配置的 CLI 核对 help。恢复传选中 JSONL 的绝对路径，分支传源文件和独立的 `huhu-…` ID。现有 Pi E2E 断言分支 header 的 ID、cwd 和 `parentSession`，并在预览与分支后核对原文件完整字节。恢复启动后允许 Pi 正常追加，并核对原字节前缀。 [Pi 能力检查](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/detect.ts#L88) [原生 Pi E2E](../../../../../temp/issue-worktrees/integration/tests/e2e/shell.spec.ts#L1261)
- 列表先对账，只有运行中的匹配会话显示活动。已有 `historyId` 的绑定必须精确匹配；旧绑定回退到同 provider、同 native ID、同 cwd 且扫描内唯一。定位会复查唯一会话、Core 归属、结束状态和精确布局，返回 Space、Tab 和叶子。界面只接受当前导航的响应。会话结束后可按恢复资格重新打开。历史引用带旧 `historyId` 时须在重扫中找到同 ID；Pi 同路径替换和 Claude/Codex 的唯一性边界由上述 P2 覆盖。 [历史匹配及并发防重](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L570) [定位](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L712) [终端归属复核](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L804) [界面定位](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx#L297)

## 门禁与取证范围

- 中间组装日志的定向 Vitest 为 55 通过、3 跳过。关联桌面运行通过了两条 OAuth 用例和 Claude/Codex 只读扫描，Pi 卡在范围选择器。下一轮原生 Pi 已到达原 Pane、原 terminal ID 和原 Space 会话数仍为 2 的断言，其后的整文件等值断言因实际 Pi 追加合法 thinking 记录失败。`f04dacb8` 修正范围选择器及恢复后的断言。两轮均按中间记录计。 [组装日志](../../../../../temp/issue-baseline/w5-oauth-assembly.log#L469) [Pi 定位日志](../../../../../temp/issue-baseline/w5-pi-location.log#L17)
- 冻结候选门禁已记录 lint、typecheck、format、knip 和 build 通过，构建信息为 `7ff591a`。Windows 测试阶段已记录 `oauth-engine.test.ts` 两条通过。截至本机 07:22 完整 Windows 测试仍在运行，冻结版的桌面 OAuth 与原生 Pi E2E 尚待门禁结果。 Claude/Codex 的原生恢复与分支目前只有参数层证据，现有桌面用例验证的是只读扫描。 [冻结门禁日志](../../../../../temp/issue-baseline/7ff591a0-window-candidate.log)
- 本次仅以 Git 对象审阅代码，另用 Node 执行一轮合成记录探针。探针在系统临时目录运行，结束后已清理。未打开真实 provider、读取真实历史、远程执行、修改候选代码、切换集成树或重建。
