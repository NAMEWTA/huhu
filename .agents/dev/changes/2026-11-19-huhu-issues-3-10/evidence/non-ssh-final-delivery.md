# 非 SSH 复刻交付收口（2026-11-23）

本次交付范围为 #3、#4、#5、#6、#8、#9、#10 的已确认需求与原型。#7 SSH 暂停，已有代码和 change 保留。下表衔接[上一轮独立审计](non-ssh-completion-audit-5ea79f71.md)，关闭其中的确定缺口；不把线上、跨设备或其他平台的未运行验证写成通过。

| Issue | 当前实现与交付依据 |
| --- | --- |
| #3 桌面外壳 | 原生菜单、宿主入口、文档与看板关窗结算；最终包 close、web、dashboard 验证失败保留、重试、放弃和重开。Wayland 启动证据保留，完整宿主窗口矩阵由用户后测。 |
| #4 Agent CLI | 补齐当前标签收纳、纯布局包恢复和独立 Vault 身份；真实 Core 6/6 与最终包 workspace 两项。Claude/Codex 恢复与原生分支补齐，官方 Codex 0.170.0 和具名 Volta 0.171.0 本地协议探针通过；桌面生产入口配合合成 provider 两项通过。原生身份确认后列表/查看弹窗同步资格，桌面定位后可重开历史。Pi 与此前已通过的原生交互路径保留。 |
| #5 Tasks / Automations | 同一 Tasks 派遣、跨日触发、原生问答、回执重交与唯一结果；最终包 tasks、workspace、external-agent。 |
| #6 统一工具 / Web | CLI-only、MCP-only 同一任务与原会话，授权与撤销、两份邀请三会话、独立 Web 编辑；最终包 external-agent、gateway、web。 |
| #8 Mail | 用户定案“旧信回 Inbox 不再次通知，只更新列表”已实现，真实 Engine 16/16，分类独审关闭；真正新信、首扫、重放、延后消息与跨重启窗口分别验证。Mail 工作台既有 13 项源码证据保留，最终 package 验 Safe 锁定下模块认证及新格式恢复。 |
| #9 Safe / 模块凭据 | Safe 与模块凭据独立，Linux Secret Service、原生受保护环境及备份恢复已有证据；最终 package 五项包含锁 Safe 仍可邮件认证、恢复后需重新配置。 |
| #10 首页看板 | 共享布局、独立草稿、版本冲突、保存回执与关窗联动；最终 dashboard、close、web。四主题与明暗、缩放、键盘已有证据保留。 |

## 验证边界

用户已明确没有额外账号或设备，由其后续自行测试。未运行的真实线上 Gmail/Microsoft/IMAP/SMTP、第二台 LAN 设备、Windows/macOS 安装及系统凭据后端、完整 GNOME 窗口操作、真实 OS 输入法和读屏矩阵不作为本轮实现交付阻塞，也不声称通过。Graph 专属新增授权和旧格式迁入按此前产品决定排除。

本轮没有重复执行全量测试或全量 E2E。原全量测试及早期 E2E 的失败、跳过和环境错误保留原记录；受影响路径用后续定向红绿、类型、独审、真实桌面及固定包联验闭环。最终包联验不是全平台零缺陷保证。

本轮仅交付代码与本地安装包，不部署、不发布 Release、不关闭 Issue，不归档或删除保留中的 change。

## 固定组合结果

应用和驱动同为 `f6c4e0d5684afa6e832340c4fbb4fd5445cf71b5`。AppImage SHA-256 `6d21c2d25f18ea775c3f611165cbb29c5f68cf71c946acb23c0eb968e40b46cb`；deb SHA-256 `fb29b907989774d647d16051bd6cd6c69567ea341cabf298fe0e5829eef346a8`。八组安装包共 15 项通过，失败、跳过、flaky 和测试外 errors 均为 0；另有同源码构建的历史 UI 2/2。实际结果及各原始报告摘要见[固定包索引](linux-package-f6c4e0d5.json)。历史 UI 使用合成 provider、真实 Core 与生产 helper；官方 Codex 探针另列，不能混称线上模型验收。

后续交付提交仅整理文档与证据，安装包应用版本仍为上述固定提交。
