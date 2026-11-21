# task01.md #10 W03-01 可信 Widget 贡献契约

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t3b
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t3b`
- 当前任务 — task01.md
- 任务路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t3b/task01.md
- 报告路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t3b/report01.md
- Lead 收件 — 回告终稿绝对路径，由外部 Lead 收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/widgets

## 目标与验收

以集成快照 0cda9b4 开工。依据 #10 W03-01、spec、design 与当前 ContributionRegistry、PluginManifest、两端 widget 入口。先交可独立验证、实际复用的可信纯数据描述与注册合同，稳定 widget:<owner>:<id>、尺寸、实例数量、配置 schema/默认值、声明能力和启用/授权投影。从现有 SSH 主机卡和 manifest 提供真实声明样本，并核对同一名义入口的 Renderer 元数据与后端可共用描述。为重复、漏报、多报、禁用、外部组件与权限下降提供输入。确认体验涉及的抽屉、视觉、交互与文案等待对应原型反馈。

## 读写与交付

可写 packages/contracts/src/home.ts 或同包专用 Widget 文件（不写公共 barrel，确需由 Lead 接线）、packages/workbench/src/contributions.ts、对应单元测试和 SSH 的 widget 共享元数据、清单字段及现有注册点。不得改 Engine 装配、读取布局入口、新版 Renderer 入口、根锁或 #6 公共能力。与 t1c 的 SSH capability 业务定义保持独立。需要 Engine 装配时交 Lead 接入。测试需覆盖正常实际描述、清单不一致、重复、禁用与授权位，说明能证明的层及后续接线。所有客户端 JS/TS 修改前在该切片完成 zh-modern-web-guidance 的 search 和 retrieve。

读取项目当前规格、计划、原型确认记录及直接调用方。保护原工作区、真实 Vault 和 Agent 历史。用隔离测试数据与正常入口验证。禁止远端写入与自行派遣。使用 Core 文件协议核对 topic、active 指针和准确报告位置，报告非覆盖发布后回告绝对路径。
