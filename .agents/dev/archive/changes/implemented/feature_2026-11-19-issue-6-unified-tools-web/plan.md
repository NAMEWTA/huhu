> 2026-11-23 归档：本 change 已按当前实现及用户确认范围完成；独立复核见仓库 `.agents/system/herdr-core/2026-11-23-huhu-closeout-release/`。线上账号、跨设备及其他平台实机未验证，不记为通过。原路径 `.agents/dev/changes/2026-11-19-issue-6-unified-tools-web`；归档路径 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web`。后续 Issue 状态与版本发布由本轮收尾记录追踪。

# #6 统一工具与 Web 工作台实施索引

用户在桌面管理工具开放策略，并在受邀浏览器中操作同一 Vault。 交付编号沿用原计划，每个子编号链接到唯一任务正文。[行为规格](spec.md) · [架构及产品决定](design.md) · [原 Issue 与验收编号](source.md)

开发依据为 Huhu 当前检出 `9f870c0`。固定版本的来源引用用于追溯。本轮交付为 Markdown 规划；下表依赖指实施时所需的合同或产物。[批次源码清单](../../../../changes/2026-11-19-huhu-issues-3-10/sources.md)

## 切片与依赖

| 上级 | 可独立接手的交付 | 前置产物所在切片 |
| --- | --- | --- |
| G1 | [G1.1 从用户动作查到唯一领域入口](tasks/G1.1-action-inventory.md) | 可独立开始 |
| G1 | [G1.2 插件停用后仍能查看工具说明](tasks/G1.2-inactive-catalog.md) | [G1.1](tasks/G1.1-action-inventory.md) |
| G2 | [G2.1 干净安装零开放，重启可读回用户选择](tasks/G2.1-vault-policy.md) | [G1.2](tasks/G1.2-inactive-catalog.md) |
| G2 | [G2.2 两位管理者按版本提交整批选择](tasks/G2.2-batch-commit.md) | [G2.1](tasks/G2.1-vault-policy.md) |
| G2 | [G2.3 检查为何可用并在实际调用时复核](tasks/G2.3-effective-access.md) | [G2.1](tasks/G2.1-vault-policy.md) |
| G3 | [G3.1 CLI 与外部 API 发现并调用同一能力](tasks/G3.1-cli-api.md) | [G2.3](tasks/G2.3-effective-access.md) |
| G3 | [G3.2 两种 MCP 传输读取同一份目录与变更](tasks/G3.2-mcp-discovery.md) | [G2.3](tasks/G2.3-effective-access.md) |
| G3 | [G3.3 响应丢失后查询同一操作的结果](tasks/G3.3-intent-outcomes.md) | [G2.3](tasks/G2.3-effective-access.md) |
| G3 | [G3.4 扩展命令逐项开放且代理保留调用者](tasks/G3.4-extension-actions.md) | [G2.3](tasks/G2.3-effective-access.md) |
| G4 | [G4.1 从三个设置入口筛选并跨页选择](tasks/G4.1-filter-selection.md) | [G1.2](tasks/G1.2-inactive-catalog.md)、[G2.1](tasks/G2.1-vault-policy.md) |
| G4 | [G4.2 预览批量影响并处理提交冲突](tasks/G4.2-bulk-preview.md) | [G4.1](tasks/G4.1-filter-selection.md)、[G2.2](tasks/G2.2-batch-commit.md) |
| G5a | [G5a.1 从外部维护笔记和受管文件](tasks/G5a.1-notes-domain.md) | [G3.1](tasks/G3.1-cli-api.md)、[G2.3](tasks/G2.3-effective-access.md) |
| G5a | [G5a.2 维护档案类型和文件关联](tasks/G5a.2-archives.md) | [G3.1](tasks/G3.1-cli-api.md) |
| G5a | [G5a.3 转换收件项并找到撤销结果](tasks/G5a.3-inbox.md) | [G3.1](tasks/G3.1-cli-api.md) |
| G5a | [G5a.4 外部提交、同步和恢复版本](tasks/G5a.4-versioning.md) | [G3.1](tasks/G3.1-cli-api.md)、[#9](../feature_2026-11-19-issue-9-safe-accounts/spec.md) |
| G5a | [G5a.5 外部调用指南检查和备份恢复](tasks/G5a.5-agent-guide.md) | [G3.1](tasks/G3.1-cli-api.md) |
| G5a | [G5a.6 管理 Vault、插件和服务的公开动作](tasks/G5a.6-kernel-admin.md) | [G3.1](tasks/G3.1-cli-api.md)、[G3.3](tasks/G3.3-intent-outcomes.md) |
| G5b | [G5b.1 经单一外部入口完成任务问答](tasks/G5b.1-task-run.md) | [G3.1](tasks/G3.1-cli-api.md)、[G3.2](tasks/G3.2-mcp-discovery.md)、[G3.3](tasks/G3.3-intent-outcomes.md)、[#5](../feature_2026-11-19-issue-5-task-automation/spec.md) |
| G5b | [G5b.2 外部管理自动化规则和已排队任务](tasks/G5b.2-automation-rules.md) | [G3.1](tasks/G3.1-cli-api.md)、[G3.2](tasks/G3.2-mcp-discovery.md)、[G3.3](tasks/G3.3-intent-outcomes.md)、[#5](../feature_2026-11-19-issue-5-task-automation/spec.md) |
| G5b | [G5b.3 按指定 Space 观察与恢复 Agent 会话](tasks/G5b.3-agent-sessions.md) | [G3.1](tasks/G3.1-cli-api.md)、[G3.2](tasks/G3.2-mcp-discovery.md)、[#4](../feature_2026-11-19-issue-4-agent-cli/spec.md) |
| G5c | [G5c.1 从公共目录看到 SSH 资源与等待项](tasks/G5c.1-ssh-consumer.md) | [G3.1](tasks/G3.1-cli-api.md)、[G3.2](tasks/G3.2-mcp-discovery.md)、[#7](../../../../changes/2026-11-19-issue-7-ssh-module/spec.md) |
| G5c | [G5c.2 按真实可用性发现 Mail 同步操作](tasks/G5c.2-mail-consumer.md) | [G3.1](tasks/G3.1-cli-api.md)、[#8](../feature_2026-11-19-issue-8-mail-module/spec.md) |
| G5c | [G5c.3 分开授权摘要读取与显式查看](tasks/G5c.3-safe-consumer.md) | [G3.1](tasks/G3.1-cli-api.md)、[G3.2](tasks/G3.2-mcp-discovery.md)、[#9](../feature_2026-11-19-issue-9-safe-accounts/spec.md) |
| G5c | [G5c.4 卡片只读取已允许的业务数据](tasks/G5c.4-widget-consumer.md) | [G2.3](tasks/G2.3-effective-access.md)、[#10](../feature_2026-11-19-issue-10-widget-dashboard/spec.md) |
| G6 | [G6.1 桌面启停 Web 并看到可用地址](tasks/G6.1-web-listener.md) | 可独立开始 |
| G6 | [G6.2 打包工作台可在普通浏览器打开深链](tasks/G6.2-host-bootstrap.md) | [G6.1](tasks/G6.1-web-listener.md) |
| G6 | [G6.3 重取同一邀请并让两台设备分别加入](tasks/G6.3-repeatable-invite.md) | [G6.1](tasks/G6.1-web-listener.md)、[G6.2](tasks/G6.2-host-bootstrap.md) |
| G6 | [G6.4 撤销邀请并断开它建立的会话](tasks/G6.4-revoke-invite.md) | [G6.3](tasks/G6.3-repeatable-invite.md) |
| G6 | [G6.5 两台设备看到同一任务版本](tasks/G6.5-two-device-edits.md) | [G6.3](tasks/G6.3-repeatable-invite.md)、[G2.3](tasks/G2.3-effective-access.md) |
| G7 | [G7.1 文件落在选择它的设备](tasks/G7.1-device-files.md) | [G6.3](tasks/G6.3-repeatable-invite.md)、[#7](../../../../changes/2026-11-19-issue-7-ssh-module/plan.md) |
| G7 | [G7.2 刷新浏览器后接续原会话](tasks/G7.2-terminal-ownership.md) | [G6.3](tasks/G6.3-repeatable-invite.md)、[G2.3](tasks/G2.3-effective-access.md)、[#4](../feature_2026-11-19-issue-4-agent-cli/spec.md)、[#7](../../../../changes/2026-11-19-issue-7-ssh-module/plan.md) |
| G8 | [G8.1 全仓调用方切到唯一新合同](tasks/G8.1-one-contract.md) | [G3.4](tasks/G3.4-extension-actions.md)、[G4.2](tasks/G4.2-bulk-preview.md)、[G5a.1](tasks/G5a.1-notes-domain.md)、[G5a.2](tasks/G5a.2-archives.md)、[G5a.3](tasks/G5a.3-inbox.md)、[G5a.4](tasks/G5a.4-versioning.md)、[G5a.5](tasks/G5a.5-agent-guide.md)、[G5a.6](tasks/G5a.6-kernel-admin.md)、[G5b.1](tasks/G5b.1-task-run.md)、[G5b.2](tasks/G5b.2-automation-rules.md)、[G5b.3](tasks/G5b.3-agent-sessions.md)、[G5c.1](tasks/G5c.1-ssh-consumer.md)、[G5c.2](tasks/G5c.2-mail-consumer.md)、[G5c.3](tasks/G5c.3-safe-consumer.md)、[G5c.4](tasks/G5c.4-widget-consumer.md) |
| G8 | [G8.2 在同一构建复核跨入口结果](tasks/G8.2-integration-evidence.md) | [G8.1](tasks/G8.1-one-contract.md)、[G6.4](tasks/G6.4-revoke-invite.md)、[G6.5](tasks/G6.5-two-device-edits.md)、[G7.1](tasks/G7.1-device-files.md)、[G7.2](tasks/G7.2-terminal-ownership.md) |

## 执行顺序与归属

- [G1.1](tasks/G1.1-action-inventory.md) 盘点用户动作，[G6.1](tasks/G6.1-web-listener.md) 可同时核对 Web listener 的独立生命周期。登记 ID 与描述后，Kernel 独占注册、策略持久化和调用判定。CLI、MCP 及工作台分别消费已稳定的投影。
- 领域切片只负责自身 handler；#4/#5 提供会话与任务状态，#7/#8/#9/#10 分别提供本域最小合同，不必等待所有模块一起完成。跨设备同步及流控制由 [G6.5](tasks/G6.5-two-device-edits.md)、[G7.1](tasks/G7.1-device-files.md) 和 [G7.2](tasks/G7.2-terminal-ownership.md) 验收。公共注册和 boot 接线由 Kernel 一处整合。
- [G8.1](tasks/G8.1-one-contract.md) 收齐调用方并一次切到新模型，[G8.2](tasks/G8.2-integration-evidence.md) 负责同一构建的跨入口证据。新格式备份和恢复用测试 Vault，真实旧资料不参与。
- 首次安装和邀请撤销均按[已定的策略](spec.md#同一批选择怎样生效)及[已定的会话归属](spec.md#桌面分享当前工作台)验收。设计 Q6-3 仅影响是否增加按主机缩小范围的选择。

## 从规格反查

| 需求范围 | 来源编号 | 实施与验收正文 |
| --- | --- | --- |
| 目录、身份与可用性 | A01–A07 | [G1.1](tasks/G1.1-action-inventory.md)、[G1.2](tasks/G1.2-inactive-catalog.md)、[G2.1](tasks/G2.1-vault-policy.md)、[G2.3](tasks/G2.3-effective-access.md)、[G3.4](tasks/G3.4-extension-actions.md)、[G4.2](tasks/G4.2-bulk-preview.md)、[G5a.1](tasks/G5a.1-notes-domain.md)、[G5a.6](tasks/G5a.6-kernel-admin.md)、[G5b.3](tasks/G5b.3-agent-sessions.md) |
| 批量选择、持久化及冲突 | B01–B05 | [G2.1](tasks/G2.1-vault-policy.md)、[G2.2](tasks/G2.2-batch-commit.md)、[G4.1](tasks/G4.1-filter-selection.md)、[G4.2](tasks/G4.2-bulk-preview.md) |
| MCP、CLI 与 API 的发现和调用 | C01–C07 | [G1.2](tasks/G1.2-inactive-catalog.md)、[G2.2](tasks/G2.2-batch-commit.md)、[G3.1](tasks/G3.1-cli-api.md)、[G3.2](tasks/G3.2-mcp-discovery.md)、[G3.3](tasks/G3.3-intent-outcomes.md)、[G3.4](tasks/G3.4-extension-actions.md) |
| 任务问答、规则与 Agent 会话 | D01–D03 | [G5b.1](tasks/G5b.1-task-run.md)、[G5b.2](tasks/G5b.2-automation-rules.md)、[G5b.3](tasks/G5b.3-agent-sessions.md) |
| SSH 的认证、等候、作业、文件和输入 | D04–D07、D10 | [G5c.1](tasks/G5c.1-ssh-consumer.md)、[G7.1](tasks/G7.1-device-files.md)、[G7.2](tasks/G7.2-terminal-ownership.md) |
| 笔记、档案、收件箱、版本和敏感资料 | D08–D10 | [G5a.1](tasks/G5a.1-notes-domain.md)、[G5a.2](tasks/G5a.2-archives.md)、[G5a.3](tasks/G5a.3-inbox.md)、[G5a.4](tasks/G5a.4-versioning.md)、[G5c.3](tasks/G5c.3-safe-consumer.md)、[G6.5](tasks/G6.5-two-device-edits.md) |
| 指南、系统及新增模块 | §7；A01、A05 | [G5a.5](tasks/G5a.5-agent-guide.md)、[G5a.6](tasks/G5a.6-kernel-admin.md)、[G5c.2](tasks/G5c.2-mail-consumer.md)、[G5c.4](tasks/G5c.4-widget-consumer.md) |
| 可访问链接、设备共享和服务失效 | E01–E07 | [G6.1](tasks/G6.1-web-listener.md)、[G6.2](tasks/G6.2-host-bootstrap.md)、[G6.3](tasks/G6.3-repeatable-invite.md)、[G6.4](tasks/G6.4-revoke-invite.md)、[G6.5](tasks/G6.5-two-device-edits.md)、[G7.1](tasks/G7.1-device-files.md)、[G7.2](tasks/G7.2-terminal-ownership.md) |
| 破坏性切换、证据和文档 | F01–F03 | [G8.1](tasks/G8.1-one-contract.md)、[G8.2](tasks/G8.2-integration-evidence.md) |

## 原型确认与交接

原型对照工具选择与有效性、批量预览、桌面服务和浏览器会话四类交互。Electron 使用锁定版 44.9.1 的 Chromium，Web 遵循 Baseline Widely available；普通局域网 HTTP 的复制和操作标识须分环境验收。 用户尚未确认 HTML 版本。各界面片列出具体场景，按版本指纹、已走查状态和覆盖范围确认；未展示的状态保留为待核范围。原型及其记录由同批原型负责人维护。[打开原型](prototype/index.html) · [原型确认记录](prototype-review.md)

## 2026-11-23 实施收尾补充

普通评论与独立 Web 构建已补齐。获授权 CLI/MCP 可给 Agent 任务添加普通讨论评论，不能伪造执行回执；普通评论不会自动成为任务输入。浏览器通过独立 Vite 入口生成 out/web，复用工作台组件，Engine 提供该产物，空 plugins/mcp 已删除。两份邀请、三个浏览器会话与逐份撤销有实际源码桌面/Web 验证。

本节更新早期规划中的待实施状态，保留旧记录的当时事实。独立报告与本轮实际验证见 [收尾进展](../feature_2026-11-23-closeout-preview-release/progress.md)；最终安装包及发布状态以该记录后续条目为准。用户无额外测试设备或在线账号，已明确后续自行验证；线上邮箱、第二设备、Windows/macOS 实机、真实输入法和读屏未记为通过。SSH 暂停，#7/#11/#12 不属于本次结案范围。
