# 产品定义

## 1. 定位

HUHU Workbench 是一个本地优先、插件化的个人全能工作台：在一个 Vault 文件夹里管理笔记、任务、档案与灵感，并在同一界面中使用成熟的 Agent CLI、SSH 与定时自动化完成工作。

- **文件属于用户。** 所有内容是可直接阅读的 Markdown；离开 HUHU 仍能使用。
- **人做判断，工具做执行。** Agent 可以处理任务、提出问题、给出结果，但“完成”永远由人勾选。
- **成熟工具优先。** HUHU 不自己实现 AI 模型对话，而是编排 Claude Code、Codex 等成熟 CLI；终端由 Herdr Core 托管。
- **一套能力，多个入口。** 桌面界面、命令行、MCP 与 HTTP 调用同一组能力。

单用户、本机使用；不提供账户、云服务或多人协作。

## 2. 模块与首版范围

首版交付以下全部模块（brief 约束 7）。每个模块的行为契约在对应文件中。

| 模块 | 用户价值 | 规格 |
| --- | --- | --- |
| 启动与 Vault | 打开/新建/示例/导入数据包、切换与关闭、只读打开 | [workbench](modules/workbench.md) |
| 工作台首页 | 总览指标、我的任务、最近笔记、专注计时、习惯、收件箱、最近活动、命令面板、通知 | [workbench](modules/workbench.md) |
| 知识库 | 文件树、笔记与文件夹管理、四模式 Markdown 编辑、草稿与保存、外部修改合并、双链与反链、属性、大纲、批注、多种文件类型、日记、标签、星标、回收站 | [knowledge](modules/knowledge.md) |
| 任务 | 两态待办、五个截止日分类、列表/看板/月历、手动或 Agent 执行、资源模糊多选、独立提醒、运行记录与问答 | [tasks](modules/tasks.md) |
| 自动化 | 定时激活动作：扫描 Agent 任务、Agent 提示、脚本、通知；预览、立即运行、激活记录、结果对账 | [automations](modules/automations.md) |
| 档案 | 自定义类型与字段、表格/卡片、双向关系、关联笔记与任务、类型迁移 | [archives](modules/archives.md) |
| 收件箱 | 快速捕获、转为任务/笔记/档案、归档、撤销 | [inbox](modules/inbox.md) |
| Agent CLI | Space、CLI 检测与启动菜单、多会话与分屏、按目录的会话历史与恢复、变更审查 | [agent-cli](modules/agent-cli.md) |
| 远程连接 | SSH 主机与跳板链、主机密钥信任、交互 Shell、Exec、SFTP、审计 | [ssh](modules/ssh.md) |
| 保险箱 | 主密码加密的凭据、引用使用、自动锁定、访问记录 | [safe](modules/safe.md) |
| 版本历史 | 文件历史与差异、恢复、Git 工作区与提交、远端同步与冲突处理 | [versioning](modules/versioning.md) |
| 插件中心 | 内置功能启停、外部扩展安装/卸载、运行时与权限 | [plugins](modules/plugins.md) |
| 能力网关 | MCP、CLI、HTTP 服务、测试台、调用记录 | [plugins](modules/plugins.md) |
| Agent 接入指南 | Vault 内三份指南文件的维护与冲突保护 | [plugins](modules/plugins.md) |
| 健康中心 | 诊断、事件日志、通知 | [system](modules/system.md) |
| 设置 | 外观、Vault、编辑器、日期时间、快捷键、数据与存储、关于 | [system](modules/system.md) |

## 3. 跨模块工作流

### W-A 把一件事交给 Agent

1. 收件箱捕获一个想法 → 转为任务，执行方式选 Agent，选择 Space 与 Codex，关联研究文件夹。
2. 内置规则在下一个 5 分钟扫描到它，冻结输入并在 Space 根启动 Codex 无界面运行。
3. Agent 提问 → 任务详情显示问题，用户回答，Agent 在同一会话继续。
4. 运行成功 → 任务详情显示结果；用户阅读后勾选完成。也可以在 Agent CLI 中从该 Space 的历史“恢复会话”继续交互。

涉及：[inbox](modules/inbox.md)、[tasks](modules/tasks.md)、[automations](modules/automations.md)、[agent-cli](modules/agent-cli.md)。

### W-B 写作与回溯

在知识库写笔记、加批注、链接到档案；外部 Agent 通过 MCP 读取笔记并写入一条捕获；某次误改后在版本历史恢复上一版；最后同步到 Git 远端。

涉及：[knowledge](modules/knowledge.md)、[plugins](modules/plugins.md)、[versioning](modules/versioning.md)。

### W-C 远程运维脚本

在保险箱保存服务器密码与 API Token；SSH 模块用密码引用连接主机；自动化每天 9:00 运行一个使用 Token 环境变量的本地脚本，输出写入运行结果。

涉及：[safe](modules/safe.md)、[ssh](modules/ssh.md)、[automations](modules/automations.md)。

## 4. 明确不做（首版）

- 账户、云同步服务、多人实时协作、移动端。
- 内置大模型对话界面（Agent 交互通过成熟 CLI 的终端完成）。
- 系统通知、IM、短信、邮件渠道（界面中显示“暂不支持”）。
- 任务优先级、子任务、重复任务（定时工作由自动化承担）。
- 白板、可视化 WYSIWYG（ProseMirror）编辑。
- 应用签名、公证、自动更新；三个目标以外的平台。
