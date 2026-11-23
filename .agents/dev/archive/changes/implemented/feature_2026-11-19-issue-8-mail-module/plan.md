> 2026-11-23 归档：本 change 已按当前实现及用户确认范围完成；独立复核见仓库 `.agents/system/herdr-core/2026-11-23-huhu-closeout-release/`。线上账号、跨设备及其他平台实机未验证，不记为通过。原路径 `.agents/dev/changes/2026-11-19-issue-8-mail-module`；归档路径 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module`。后续 Issue 状态与版本发布由本轮收尾记录追踪。

# Mail 实施计划与切片索引

从添加邮箱、联系人搜索和阅读到保存草稿、发送及核对结果，最后在新 Vault 或既有 Vault 恢复新格式资料。本计划安排后续实施，各切片维护自己的交付边界、验收与证据。 [行为规格](spec.md) · [技术设计](design.md) · [Issue 历史原文](source.md) · [批次源码清单](../../../../changes/2026-11-19-huhu-issues-3-10/sources.md)

## 切片索引与依赖

| 原交付 | 可独立交接的任务 | 需要的产物或决定 |
| --- | --- | --- |
| S0 · 开发来源和后端选择 | [S0.1 确认可复用源码与 Huhu 的差异](tasks/S0.1-source-baseline.md) | 无，可直接在隔离样本上验证 |
| S0 · 开发来源和后端选择 | [S0.2 确定首条收发路径的协议后端](tasks/S0.2-transport-choice.md) | [S0.1](tasks/S0.1-source-baseline.md) |
| S1a · 账号与首次收件 | [S1a.1 用预设发现文件夹并保存邮箱](tasks/S1a.1-account-discovery.md) | [S0.2](tasks/S0.2-transport-choice.md)、[#9](../feature_2026-11-19-issue-9-safe-accounts/plan.md) [P0.2](../feature_2026-11-19-issue-9-safe-accounts/tasks/P0.2-credential-replacement.md) 的模块保存与替换合同 |
| S1a · 账号与首次收件 | [S1a.2 从所选邮箱读到首封 IMAP 邮件](tasks/S1a.2-first-message.md) | [S1a.1](tasks/S1a.1-account-discovery.md) |
| S1a · 账号与首次收件 | [S1a.3 在账号栏切换邮箱并修复认证](tasks/S1a.3-manage-accounts.md) | [S1a.1](tasks/S1a.1-account-discovery.md) |
| S1a · 账号与首次收件 | [S1a.4 预览影响并删除指定邮箱](tasks/S1a.4-remove-account.md) | [S1a.1](tasks/S1a.1-account-discovery.md)、[S1b.4](tasks/S1b.4-outbox-reconcile.md) 的投递对账合同 |
| S1b · 草稿、附件与投递 | [S1b.1 离线写一封富文本并继续编辑](tasks/S1b.1-compose-draft.md) | [S1a.1](tasks/S1a.1-account-discovery.md) |
| S1b · 草稿、附件与投递 | [S1b.2 添加、移除并恢复草稿附件](tasks/S1b.2-managed-attachments.md) | [S1b.1](tasks/S1b.1-compose-draft.md) |
| S1b · 草稿、附件与投递 | [S1b.3 同一草稿版本只启动一次投递](tasks/S1b.3-submit-draft.md) | [S1b.1](tasks/S1b.1-compose-draft.md)；含附件校验接 [S1b.2](tasks/S1b.2-managed-attachments.md) |
| S1b · 草稿、附件与投递 | [S1b.4 在发件箱核对部分成功与未知投递](tasks/S1b.4-outbox-reconcile.md) | [S1b.3](tasks/S1b.3-submit-draft.md) |
| S2 · 联系人、搜索与阅读互动 | [S2.1 按公开参与者浏览单人及多人对话](tasks/S2.1-contacts.md) | [S1a.2](tasks/S1a.2-first-message.md)；本机已发事实来自 [S1b.3](tasks/S1b.3-submit-draft.md) |
| S2 · 联系人、搜索与阅读互动 | [S2.2 跨账号搜索并定位到具体邮件](tasks/S2.2-search-locate.md) | [S2.1](tasks/S2.1-contacts.md) |
| S2 · 联系人、搜索与阅读互动 | [S2.3 展开正文与原文，按单封控制外部资源](tasks/S2.3-read-message.md) | [S1a.2](tasks/S1a.2-first-message.md) |
| S2 · 联系人、搜索与阅读互动 | [S2.4 让用户知道已读是否同步到服务器](tasks/S2.4-read-state.md) | [S2.3](tasks/S2.3-read-message.md) |
| S2 · 联系人、搜索与阅读互动 | [S2.5 从原信引用回复或回复全部](tasks/S2.5-reply-forward.md) | [S1b.1](tasks/S1b.1-compose-draft.md)、[S2.3](tasks/S2.3-read-message.md) |
| S2 · 联系人、搜索与阅读互动 | [S2.6 转发原信并区分附件元数据和实际字节](tasks/S2.6-forward.md) | [S2.3](tasks/S2.3-read-message.md)、[S1b.1](tasks/S1b.1-compose-draft.md)、[S1b.2](tasks/S1b.2-managed-attachments.md) |
| S2 · 联系人、搜索与阅读互动 | [S2.7 在联系人上下文另起新话题](tasks/S2.7-new-topic.md) | [S2.1](tasks/S2.1-contacts.md)、[S1b.1](tasks/S1b.1-compose-draft.md) |
| S3 · Gmail | [S3.1 添加并重新授权 Google 邮箱](tasks/S3.1-google-consent.md) | [S1a.1](tasks/S1a.1-account-discovery.md)；真实联验需 Huhu 注册客户端 |
| S3 · Gmail | [S3.2 沿 Gmail 实际传输读信和回信](tasks/S3.2-gmail-history.md) | [S3.1](tasks/S3.1-google-consent.md)、[S1a.2](tasks/S1a.2-first-message.md)、[S1b.3](tasks/S1b.3-submit-draft.md)、[S2.5](tasks/S2.5-reply-forward.md) |
| S4 · Outlook | [S4.1 添加 Outlook 账号并说明可用权限](tasks/S4.1-microsoft-consent.md) | [S1a.1](tasks/S1a.1-account-discovery.md)；真实联验需 Microsoft 客户端/租户 |
| S4 · Outlook | [S4.2 按 Outlook 实际路径读正文和回复](tasks/S4.2-outlook-delta.md) | [S4.1](tasks/S4.1-microsoft-consent.md)、[S1a.2](tasks/S1a.2-first-message.md)、[S1b.3](tasks/S1b.3-submit-draft.md)、[S2.5](tasks/S2.5-reply-forward.md) |
| S5 · 后台调度和通知 | [S5.1 调整刷新周期并从断线恢复](tasks/S5.1-sync-schedule.md) | [S1a.2](tasks/S1a.2-first-message.md) |
| S5 · 后台调度和通知 | [S5.2 从新邮件通知回到目标消息](tasks/S5.2-new-mail-notice.md) | [S5.1](tasks/S5.1-sync-schedule.md)、[S2.2](tasks/S2.2-search-locate.md) |
| S6a · 新格式导出与整包恢复 | [S6a.1 导出一致的邮件子集或整 Vault 包](tasks/S6a.1-snapshot-export.md) | [S1a.1](tasks/S1a.1-account-discovery.md)、[S1b.2](tasks/S1b.2-managed-attachments.md)、[S1b.4](tasks/S1b.4-outbox-reconcile.md) |
| S6a · 新格式导出与整包恢复 | [S6a.2 从整 Vault 新格式备份恢复邮件](tasks/S6a.2-vault-restore.md) | [S6a.1](tasks/S6a.1-snapshot-export.md) |
| S6b · 新格式邮件子集恢复 | [S6b.1 预检并恢复 Huhu 新格式邮件子集](tasks/S6b.1-subset-restore.md) | [S6a.1](tasks/S6a.1-snapshot-export.md)；同地址提交取设计中的用户选择 |
| S7 · 可选 AI 与设置 | [S7.1 配置并验证 Mail 专用 AI 服务](tasks/S7.1-ai-settings.md) | [#9](../feature_2026-11-19-issue-9-safe-accounts/plan.md) [P0.2](../feature_2026-11-19-issue-9-safe-accounts/tasks/P0.2-credential-replacement.md) 的模块保存与替换合同 |
| S7 · 可选 AI 与设置 | [S7.2 只向已选择的 AI 服务提交选定邮件内容](tasks/S7.2-ai-selection.md) | [S7.1](tasks/S7.1-ai-settings.md)、[S2.3](tasks/S2.3-read-message.md)；采纳草稿需 [S1b.1](tasks/S1b.1-compose-draft.md) |
| S7 · 可选 AI 与设置 | [S7.3 查看占用并清理可重建邮件缓存](tasks/S7.3-cache-settings.md) | [S1b.2](tasks/S1b.2-managed-attachments.md)、[S1b.4](tasks/S1b.4-outbox-reconcile.md)、[S2.2](tasks/S2.2-search-locate.md)、[S2.4](tasks/S2.4-read-state.md) |
| S8 · 外部能力与 Web | [S8.1 通过获开放的工具操作同一邮箱](tasks/S8.1-public-capabilities.md) | [#6](../feature_2026-11-19-issue-6-unified-tools-web/plan.md) 的发现/调用合同；每组需对应业务 handler |
| S8 · 外部能力与 Web | [S8.2 从 Web 工作台传送草稿附件](tasks/S8.2-remote-files-oauth.md) | [#6](../feature_2026-11-19-issue-6-unified-tools-web/plan.md) Web 会话与授权文件流、[S1b.2](tasks/S1b.2-managed-attachments.md) |
| S8 · 外部能力与 Web | [S8.3 从另一台设备跟进同一次 OAuth 授权](tasks/S8.3-remote-oauth.md) | [#6](../feature_2026-11-19-issue-6-unified-tools-web/plan.md) Web 会话与系统浏览器宿主；[S3.1](tasks/S3.1-google-consent.md) 或 [S4.1](tasks/S4.1-microsoft-consent.md) |
| S9 · 组合交付 | [S9.1 核验 Mail 的平台、来源与完整流程](tasks/S9.1-release-evidence.md) | S0–S8 全部现行子项、[#6](../feature_2026-11-19-issue-6-unified-tools-web/plan.md)/[#9](../feature_2026-11-19-issue-9-safe-accounts/plan.md) 实际接入与相关界面确认 |

<a id="coverage"></a>

## 规格覆盖

| 规格或历史编号 | 实施与验证归属 |
| --- | --- |
| §0–3、§5、§10–11、§14，来源基线、18+1 预设和宿主差异 | [S0.1](tasks/S0.1-source-baseline.md)、[S0.2](tasks/S0.2-transport-choice.md)、[S1a.1](tasks/S1a.1-account-discovery.md)、[S9.1](tasks/S9.1-release-evidence.md) |
| M-01 账号栏、修复、首次收件与移除 | [S1a.1](tasks/S1a.1-account-discovery.md)、[S1a.2](tasks/S1a.2-first-message.md)、[S1a.3](tasks/S1a.3-manage-accounts.md)、[S1a.4](tasks/S1a.4-remove-account.md) |
| M-02/03 公开参与者、时间、搜索与通知定位 | [S2.1](tasks/S2.1-contacts.md)、[S2.2](tasks/S2.2-search-locate.md)、[S5.2](tasks/S5.2-new-mail-notice.md) |
| M-04 阅读、原文、单封资源与标读 | [S2.3](tasks/S2.3-read-message.md)、[S2.4](tasks/S2.4-read-state.md) |
| M-05 回复、回复全部、新话题和转发 | [S2.5](tasks/S2.5-reply-forward.md)、[S2.7](tasks/S2.7-new-topic.md)、[S2.6](tasks/S2.6-forward.md) |
| M-06/07 富文本、附件、草稿与发件结果；§7–8 副作用 | [S1b.1](tasks/S1b.1-compose-draft.md)、[S1b.2](tasks/S1b.2-managed-attachments.md)、[S1b.3](tasks/S1b.3-submit-draft.md)、[S1b.4](tasks/S1b.4-outbox-reconcile.md)、[S8.2](tasks/S8.2-remote-files-oauth.md) |
| §6 提供商原生身份、授权、增量及生命周期 | [S3.1](tasks/S3.1-google-consent.md)、[S3.2](tasks/S3.2-gmail-history.md)、[S4.1](tasks/S4.1-microsoft-consent.md)、[S4.2](tasks/S4.2-outlook-delta.md)、[S5.1](tasks/S5.1-sync-schedule.md) |
| M-08 AI、设置、数据管理；§9 新格式恢复 | [S7.1](tasks/S7.1-ai-settings.md)、[S7.2](tasks/S7.2-ai-selection.md)、[S7.3](tasks/S7.3-cache-settings.md)、[S6a.1](tasks/S6a.1-snapshot-export.md)、[S6a.2](tasks/S6a.2-vault-restore.md)、[S6b.1](tasks/S6b.1-subset-restore.md) |
| §8.2 全入口及 §12–13 组合验收 | [S8.1](tasks/S8.1-public-capabilities.md)、[S8.2](tasks/S8.2-remote-files-oauth.md)、[S8.3](tasks/S8.3-remote-oauth.md)、[S9.1](tasks/S9.1-release-evidence.md) |

## 工作顺序与整合

先核来源和协议身份。第一条纵向路径是账号 → 首封 IMAP 正文，以及离线草稿 → 可核对投递。账号 ID、消息定位和草稿 revision 等合同稳定后，Gmail、Outlook、查询体验与恢复可按表中依赖分别推进。Mail 维护业务 handler、schema 和事件，工作台与 Engine 的共用注册点由一名整合者更新。#6 维护外部授权与文件流，#9 协调本机保护和包收集。新装 MCP/CLI 工具默认关闭，用户可逐项或明确批量开启。

旧编号 S6b 的 one-mail 旧格式迁入已按用户决定收回，现承接 Huhu 新格式子集恢复。Huhu 子集同地址冲突策略及是否增加 Graph 专属授权分别见[设计待决项](design.md#open)，各自仅约束相关提交或授权分支。

## 界面与实施环境

[原型入口](prototype/index.html)与[版本及确认范围](prototype-review.md)由原型组维护。本轮只交付 Markdown 规划。用户尚未确认 HTML；每个切片列出应核对的场景。已确认场景按相同视口、主题、输入和状态比对；只有模拟或尚未覆盖的状态单列。桌面按项目 Electron 44.9.1 的实际 Chromium 验证，Web 按 Baseline Widely available，系统操作通过宿主接口。联验记录标明实际平台/浏览器、权限和测试输入。

## 2026-11-23 实施收尾补充

M-01 账号操作和可调分栏已补齐。账号未读数、悬停刷新、右键管理和分栏调节已实现。账号行与联系人使用同一邮件副本规则，可重建缓存失败保留账号管理；宽度按 Vault 持久保存，权限等待、迟到读取、连续写入、失败重试和离场草稿协调均有 Electron 回归。旧信回到 Inbox 按用户决定只更新列表，不再次通知。

本节更新早期规划中的待实施状态，保留旧记录的当时事实。独立报告与本轮实际验证见 [收尾进展](../feature_2026-11-23-closeout-preview-release/progress.md)；最终安装包及发布状态以该记录后续条目为准。用户无额外测试设备或在线账号，已明确后续自行验证；线上邮箱、第二设备、Windows/macOS 实机、真实输入法和读屏未记为通过。SSH 暂停，#7/#11/#12 不属于本次结案范围。
