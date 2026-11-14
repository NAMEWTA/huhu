# HUHU Workbench 1.0 开发规格

## 问题

见 [brief](brief.md)。个人用户需要一个文件可读、执行可追溯、人保留完成判断的本地工作台。

## 目标体验

用户打开一个文件夹即进入工作台：写笔记、记待办、整理档案与灵感；把一件待办交给 Agent 后去做别的事，回来看到结果或问题，自己决定是否完成；在同一界面使用 Claude Code / Codex 等 CLI 与 SSH；所有内容随时可以用普通编辑器打开，也可以经 Git 同步、经 CLI/MCP 被其他工具使用。完整模块范围见 [product](product.md)。

## 来源与约束

- 强制约束与输入优先级：[brief](brief.md)。
- 原型：`temp/huhu-workbench-v8`（v9），只读。各模块文档首行列出所依据的原型文件。
- 关键决定与否决方案：[decisions](decisions.md)。

## 行为契约

每个模块的用户故事、界面、行为、异常与验收在 `modules/` 中定义，是唯一权威：

| 模块 | 用户故事 | 验收 |
| --- | --- | --- |
| [workbench](modules/workbench.md) | US-WB-01–08 | ACC-WB-01–09 |
| [knowledge](modules/knowledge.md) | US-KN-01–11 | ACC-KN-01–11 |
| [tasks](modules/tasks.md) | US-TK-01–09 | ACC-TK-01–11 |
| [automations](modules/automations.md) | US-AU-01–08 | ACC-AU-01–12 |
| [archives](modules/archives.md) | US-AR-01–08 | ACC-AR-01–06 |
| [inbox](modules/inbox.md) | US-IN-01–05 | ACC-IN-01–06 |
| [agent-cli](modules/agent-cli.md) | US-AG-01–10 | ACC-AG-01–11 |
| [ssh](modules/ssh.md) | US-SH-01–06 | ACC-SH-01–08 |
| [safe](modules/safe.md) | US-SF-01–07 | ACC-SF-01–07 |
| [versioning](modules/versioning.md) | US-VS-01–07 | ACC-VS-01–08 |
| [plugins](modules/plugins.md) | US-PL-01–08 | ACC-PL-01–08 |
| [system](modules/system.md) | US-SY-01–07 | ACC-SY-01–08 |

### 全局规则（适用于所有模块）

1. **Vault 隔离。** 每个请求、查询键、事件都带 `vaultId`；切换 Vault 后旧 Vault 的迟到响应与事件被丢弃。
2. **成功以回执为准。** 界面只在收到 `ok: true` 后显示成功；乐观更新只用于 design-system §5 列出的三种操作。
3. **失败保留输入。** 表单提交失败不清空输入；关键错误以 Banner 持续显示，不只用 toast。
4. **外部副作用先记录后执行；结果未知不自动重放**（data-model §7）。
5. **Task 完成只由人决定**（tasks §1）。
6. **插件停用即时生效、数据保留**（plugins §2）。
7. **秘密只经 SecretUse 使用**（safe §1）。
8. **覆盖用户内容前必须可恢复**：版本冲突、外部修改、恢复历史、指南替换都先保留当前内容。

## 实现决定

| 主题 | 权威文件 |
| --- | --- |
| 技术栈、进程、模块边界、插件 | [architecture](architecture.md) |
| 目录、文件格式、身份、写入与恢复 | [data-model](data-model.md) |
| 能力目录、错误码、事件、HTTP/WS、CLI、MCP、Herdr、provider | [interfaces](interfaces.md) |
| 视觉与交互 | [design-system](design-system.md) |
| 成熟实现复用 | [reuse](reuse.md) |
| 安全 | [security](security.md) |
| 仓库结构与代码规范 | [engineering](engineering.md) |

## 验证决定

- 真实入口：打包前的 Electron 应用（Playwright `_electron`）、Engine HTTP 能力接口、`huhu` CLI、MCP 官方 SDK 客户端、安装包。
- 测试分层、替身、性能目标与完成门槛：[quality](quality.md)。
- 发布验证：[release](release.md) §5。
- 每条 ACC 的实现任务映射：[traceability](traceability.md)。

## 上线

首版 1.0.0，三目标平台未签名安装包，GitHub Release 草稿经人工审阅后发布：[release](release.md)。

## 范围之外

[product](product.md) §4。

## 待决问题

无阻塞开发的待决产品问题。实施期间才能确定的外部事实，以任务中的验证点处理：Herdr Core 0.1.19 各平台发布包的下载地址与哈希（W12.1 锁定）；Claude Code / Codex 当前版本打印模式参数是否与 AA 适配器一致（W12.4 用版本探测与 fake provider 契约测试，W20.3 实机确认）。
