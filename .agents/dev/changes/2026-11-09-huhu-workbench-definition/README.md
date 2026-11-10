# HUHU Workbench 开发定义

HUHU Workbench 1.0 从 0 到 1 正式开发的完整依据。原型（只读）：`temp/huhu-workbench-v8/HUHU_Workbench_V9.html`；参考源码（只读）：`temp/sources/`。

## 阅读顺序

1. [brief](brief.md)：问题、强制约束、输入优先级。
2. [product](product.md)：定位、首版范围、跨模块工作流、不做什么。
3. [spec](spec.md)：规格总入口与全局规则。
4. [decisions](decisions.md)：关键决定与否决方案。
5. [architecture](architecture.md) → [data-model](data-model.md) → [interfaces](interfaces.md)：系统如何构成、数据如何存放、模块如何通信。
6. [design-system](design-system.md)：视觉、布局、组件、交互。
7. `modules/`：12 个模块的用户故事、界面、行为与验收。
8. [reuse](reuse.md)：复制哪些成熟源码、放到哪里、怎样适配。
9. [engineering](engineering.md)、[security](security.md)、[quality](quality.md)、[release](release.md)：工程规范、安全、测试与性能、构建发布。
10. [plan](plan.md) → `tasks/`：工作包与任务；[traceability](traceability.md)：原型功能与验收到任务的映射。
11. [progress](progress.md)：当前状态。

## 每类规范的唯一权威

| 内容 | 文件 |
| --- | --- |
| 强制约束 | brief |
| 模块范围 | product |
| 技术栈、进程、模块边界、插件体系 | architecture |
| Vault 目录、文件字段、身份、写入恢复 | data-model |
| 能力名、错误码、事件、路由、CLI、Herdr、provider | interfaces |
| token、组件、交互、快捷键 | design-system |
| 模块行为与验收 | modules/* |
| 参考仓库、提交、复制路径 | reuse |
| 目录结构、代码规范、工具命令 | engineering |
| 测试分层、性能目标、完成门槛 | quality |
| 平台目标、打包、CI、发布验证 | release |
| 任务与依赖 | plan、tasks/* |

其他文件引用这些定义，不复制。修改某项规范时只改其权威文件，并检查引用它的文件。

## 模块文档

[workbench](modules/workbench.md) · [knowledge](modules/knowledge.md) · [tasks](modules/tasks.md) · [automations](modules/automations.md) · [archives](modules/archives.md) · [inbox](modules/inbox.md) · [agent-cli](modules/agent-cli.md) · [ssh](modules/ssh.md) · [safe](modules/safe.md) · [versioning](modules/versioning.md) · [plugins](modules/plugins.md) · [system](modules/system.md)
