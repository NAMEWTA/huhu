> 2026-11-23 归档：本 change 已按当前实现及用户确认范围完成；独立复核见仓库 `.agents/system/herdr-core/2026-11-23-huhu-closeout-release/`。线上账号、跨设备及其他平台实机未验证，不记为通过。原路径 `.agents/dev/changes/2026-11-19-issue-9-safe-accounts`；归档路径 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts`。后续 Issue 状态与版本发布由本轮收尾记录追踪。

# Safe 实施计划与切片索引

从一个新 Vault 建立个人多账号资料，并让 SSH、Git、Agent CLI、自动化与 Mail 各自维护业务认证。本计划安排后续实施，各切片维护自己的交付边界、验收与证据。 [行为规格](spec.md) · [技术设计](design.md) · [Issue 历史原文](source.md) · [批次源码清单](../../../../changes/2026-11-19-huhu-issues-3-10/sources.md)

## 切片索引与依赖

| 原交付 | 可独立交接的任务 | 需要的产物或决定 |
| --- | --- | --- |
| P0 · 本机认证保护 | [P0.1 验证模块能在本机独立保存和取用认证](tasks/P0.1-local-protection.md) | 无，可直接在隔离样本上验证 |
| P0 · 本机认证保护 | [P0.2 替换模块认证失败后仍可使用原配置](tasks/P0.2-credential-replacement.md) | [P0.1](tasks/P0.1-local-protection.md) |
| P1 · 个人条目与密码生命周期 | [P1.1 初始化、解锁并锁定新保险箱](tasks/P1.1-master-session.md) | 无，可直接在隔离样本上验证 |
| P1 · 个人条目与密码生命周期 | [P1.2 一次保存网站及其多个账号](tasks/P1.2-save-entry.md) | [P1.1](tasks/P1.1-master-session.md) |
| P1 · 个人条目与密码生命周期 | [P1.3 只更新选中账号或条目公共信息](tasks/P1.3-edit-account.md) | [P1.2](tasks/P1.2-save-entry.md) |
| P1 · 个人条目与密码生命周期 | [P1.4 改主密码后按对应版本解锁](tasks/P1.4-rotate-password.md) | [P1.2](tasks/P1.2-save-entry.md) |
| P2 · 标签与搜索 | [P2.1 管理彩色标签及已有条目关联](tasks/P2.1-manage-tags.md) | [P1.2](tasks/P1.2-save-entry.md) |
| P2 · 标签与搜索 | [P2.2 组合标签和搜索定位到账号](tasks/P2.2-search-filter.md) | [P1.2](tasks/P1.2-save-entry.md)、[P2.1](tasks/P2.1-manage-tags.md) |
| P3 · 页面操作 | [P3.1 从列表进入多账号表单并保存](tasks/P3.1-edit-workspace.md) | [P1.2](tasks/P1.2-save-entry.md)、[P1.3](tasks/P1.3-edit-account.md)；标签选择用 [P2.1](tasks/P2.1-manage-tags.md) |
| P3 · 页面操作 | [P3.2 安全删除指定账号或整个条目](tasks/P3.2-delete-account.md) | [P1.2](tasks/P1.2-save-entry.md) |
| P3 · 页面操作 | [P3.3 显式显示指定账号的密码并重新遮罩](tasks/P3.3-reveal-password.md) | [P1.2](tasks/P1.2-save-entry.md) |
| P3 · 页面操作 | [P3.4 复制选中账号并反馈系统结果](tasks/P3.4-copy-password.md) | [P3.3](tasks/P3.3-reveal-password.md) 的受控取值合同 |
| P4 · Git 认证 | [P4.1 向指定 Git HTTPS remote 配置与使用认证](tasks/P4.1-git-authentication.md) | [P0.2](tasks/P0.2-credential-replacement.md) |
| P4 · Git 认证 | [P4.2 修复 Git 认证后恢复同步](tasks/P4.2-git-resume.md) | [P4.1](tasks/P4.1-git-authentication.md) |
| P5 · SSH 认证 | [P5.1 只用 SSH 主机配置建立连接](tasks/P5.1-ssh-host-auth.md) | [P0.2](tasks/P0.2-credential-replacement.md)；[#7](../../../../changes/2026-11-19-issue-7-ssh-module/plan.md) 的 hostId/认证合同 |
| P5 · SSH 认证 | [P5.2 从获授权工具完成主机交互](tasks/P5.2-ssh-tool-session.md) | [P5.1](tasks/P5.1-ssh-host-auth.md)；[#6](../../../../changes/2026-11-19-issue-6-unified-tools-web/plan.md) 工具授权、[#7](../../../../changes/2026-11-19-issue-7-ssh-module/plan.md) attempt/挑战合同 |
| P6 · 启动与运行环境 | [P6.1 用 Agent CLI 自己的环境启动会话](tasks/P6.1-agent-launch-env.md) | [P0.2](tasks/P0.2-credential-replacement.md)；[#4](../../../../changes/2026-11-19-issue-4-agent-cli/plan.md) 的启动与恢复合同 |
| P6 · 启动与运行环境 | [P6.2 用规则自有认证派遣一次运行](tasks/P6.2-automation-run-env.md) | [P0.2](tasks/P0.2-credential-replacement.md)；[#4](../../../../changes/2026-11-19-issue-4-agent-cli/plan.md)/[#5](../../../../changes/2026-11-19-issue-5-task-automation/plan.md) 唯一执行链及 [P6.1](tasks/P6.1-agent-launch-env.md) 的安全交接合同 |
| P7 · Mail 的凭据合同 | [P7.1 邮箱账号和 AI 的认证各归 Mail](tasks/P7.1-mail-auth-contract.md) | [P0.2](tasks/P0.2-credential-replacement.md)；[#8](../../../../changes/2026-11-19-issue-8-mail-module/plan.md) [S1a.1](../../../../changes/2026-11-19-issue-8-mail-module/tasks/S1a.1-account-discovery.md)/[S3.1](../../../../changes/2026-11-19-issue-8-mail-module/tasks/S3.1-google-consent.md)/[S4.1](../../../../changes/2026-11-19-issue-8-mail-module/tasks/S4.1-microsoft-consent.md)/[S7.1](../../../../changes/2026-11-19-issue-8-mail-module/tasks/S7.1-ai-settings.md) 按场景提供 handler |
| P8 · Git 与包 | [P8.1 导出同一代个人资料和脱敏模块定义](tasks/P8.1-backup-contents.md) | [P1.2](tasks/P1.2-save-entry.md)、[P2.1](tasks/P2.1-manage-tags.md)；各模块定义按其交付接入 |
| P8 · Git 与包 | [P8.2 把新格式保险箱恢复到新目录](tasks/P8.2-restore-new-vault.md) | [P8.1](tasks/P8.1-backup-contents.md)、[P1.4](tasks/P1.4-rotate-password.md) |
| P8 · Git 与包 | [P8.3 验证 Git 暂存只包含可同步资料](tasks/P8.3-git-candidates.md) | [P1.2](tasks/P1.2-save-entry.md)、[P2.1](tasks/P2.1-manage-tags.md)；模块配置归属按 P4 至 P7 接入 |
| P9 · 清洁安装 | [P9.1 从空白测试 Vault 完成首次使用](tasks/P9.1-clean-install.md) | [P1.1](tasks/P1.1-master-session.md)、[P1.2](tasks/P1.2-save-entry.md) |
| P10 · 外部能力与联合切换 | [P10.1 分别控制个人管理和敏感读取](tasks/P10.1-external-safe.md) | [P1.1](tasks/P1.1-master-session.md)–[P1.4](tasks/P1.4-rotate-password.md)、[P2.1](tasks/P2.1-manage-tags.md)–[P2.2](tasks/P2.2-search-filter.md)、[P3.2](tasks/P3.2-delete-account.md)–[P3.3](tasks/P3.3-reveal-password.md)；[#6](../../../../changes/2026-11-19-issue-6-unified-tools-web/plan.md) 能力目录与受控输入 |
| P10 · 外部能力与联合切换 | [P10.2 验证所有现行消费者已切到所属模块](tasks/P10.2-cutover-evidence.md) | P3、P4、P5、P6、P8、P9、[P10.1](tasks/P10.1-external-safe.md) 的适用子项；P7 对齐 [#8](../../../../changes/2026-11-19-issue-8-mail-module/plan.md) 真实进度 |

<a id="coverage"></a>

## 规格覆盖

| 规格或历史编号 | 实施与验证归属 |
| --- | --- |
| §1–3、A01–A04 个人条目、账号写入、删除 | [P1.2](tasks/P1.2-save-entry.md)、[P1.3](tasks/P1.3-edit-account.md)、[P3.1](tasks/P3.1-edit-workspace.md)、[P3.2](tasks/P3.2-delete-account.md) |
| A05–A07 标签、搜索、显隐与复制 | [P2.1](tasks/P2.1-manage-tags.md)、[P2.2](tasks/P2.2-search-filter.md)、[P3.3](tasks/P3.3-reveal-password.md)、[P3.4](tasks/P3.4-copy-password.md) |
| B01–B03 加密、会话、改密与损坏 | [P1.1](tasks/P1.1-master-session.md)、[P1.2](tasks/P1.2-save-entry.md)、[P1.4](tasks/P1.4-rotate-password.md)、[P2.2](tasks/P2.2-search-filter.md)、[P3.3](tasks/P3.3-reveal-password.md)、[P8.1](tasks/P8.1-backup-contents.md) |
| B04–B05 新格式恢复与真实旧资料保护、§7 范围修订 | [P8.1](tasks/P8.1-backup-contents.md)、[P8.2](tasks/P8.2-restore-new-vault.md)、[P9.1](tasks/P9.1-clean-install.md) |
| C01–C03 SSH、Git 的独立认证及故障修复 | [P5.1](tasks/P5.1-ssh-host-auth.md)、[P5.2](tasks/P5.2-ssh-tool-session.md)、[P4.1](tasks/P4.1-git-authentication.md)、[P4.2](tasks/P4.2-git-resume.md) |
| C04–C06 执行环境、Mail 与外部权限 | [P6.1](tasks/P6.1-agent-launch-env.md)、[P6.2](tasks/P6.2-automation-run-env.md)、[P7.1](tasks/P7.1-mail-auth-contract.md)、[P10.1](tasks/P10.1-external-safe.md) |
| D01、D04、D05 现行消费者、清单/帮助、平台与 UI 证据 | [P10.1](tasks/P10.1-external-safe.md)、[P10.2](tasks/P10.2-cutover-evidence.md) |
| D02、D03 包/暂存、冲突、取消、钥匙不可用 | [P0.1](tasks/P0.1-local-protection.md)、[P0.2](tasks/P0.2-credential-replacement.md)、[P1.3](tasks/P1.3-edit-account.md)、[P3.3](tasks/P3.3-reveal-password.md)、[P6.1](tasks/P6.1-agent-launch-env.md)、[P6.2](tasks/P6.2-automation-run-env.md)、[P8.1](tasks/P8.1-backup-contents.md)、[P8.2](tasks/P8.2-restore-new-vault.md)、[P8.3](tasks/P8.3-git-candidates.md) |
| §4–6、§8、§10–11 模块所有权与范围 | [P0.1](tasks/P0.1-local-protection.md)、[P4.1](tasks/P4.1-git-authentication.md)、[P5.1](tasks/P5.1-ssh-host-auth.md)、[P6.1](tasks/P6.1-agent-launch-env.md)、[P6.2](tasks/P6.2-automation-run-env.md)、[P7.1](tasks/P7.1-mail-auth-contract.md)、[P10.2](tasks/P10.2-cutover-evidence.md) |

## 工作顺序与整合

P0 的平台合同与 P1 的个人库可以并行。P2、P3 依已稳定的版本和会话合同交付，消费者按各自配置接入。公共权限表、备份收集器和插件注册点各由一名整合者写入。#4/#5 的执行通道、#6 的工具开放、#7 的 SSH 交互和 #8 的 Mail 流程以所属 change 为准；P10.2 核验同一组合版本。

P9 原旧库处置已由用户决定收敛为清洁安装，范围以[规格](spec.md#installation)为准。P0 仍需按各目标平台验证本机保护后端及 Core 是否保存受保护环境；仅受影响功能等待所需证据。

## 界面与实施环境

[原型入口](prototype/index.html)与[版本及确认范围](prototype-review.md)由原型组维护。本轮只交付 Markdown 规划。用户尚未确认 HTML；每个切片列出应核对的场景。已确认场景按相同视口、主题、输入和状态比对；只有模拟或尚未覆盖的状态单列。桌面按项目 Electron 44.9.1 的实际 Chromium 验证，Web 按 Baseline Widely available，系统操作通过宿主接口。联验记录标明实际平台/浏览器、权限和测试输入。
