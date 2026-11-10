# W16 插件中心与外部插件

## W16.1 内置插件启停与贡献撤销

- 目标：插件中心四个页面；启用/停用内置插件时界面贡献、命令、能力即时增减，数据保留。
- 依据：[plugins](../modules/plugins.md) §2；ACC-PL-01、02；ACC-WB-08；ACC-AU-10（停用 tasks 部分）。
- 前置：W03.2、W02.3。
- 位置：`packages/kernel/src/capabilities/plugins.ts`、`packages/workbench/src/pages/plugins/`。
- 复用：R-52。
- 实现要点：`plugins.list`/`setEnabled`；依赖连带停用确认；Renderer 订阅 `plugin.stateChanged` 挂载/卸载贡献；打开中的模块标签在插件停用时关闭（有未保存文档先走关闭流程）；运行时页显示状态与错误、重试；权限与依赖页。
- 异常：启用失败显示错误与重试；内置不可卸载（能力直接拒绝）。
- 测试：ACC-PL-01（不含 MCP 部分，MCP 在 W17.1 复测）、02；ACC-WB-08。
- 完成：上述 ACC 通过。

## W16.2 外部插件安装、宿主与权限

- 目标：从文件夹/zip 安装外部扩展，独立进程运行，按授权调用能力，卸载保留数据；三个示例扩展。
- 依据：plugins §2 行为；architecture §5 外部插件；security §6；ACC-PL-03、04。
- 前置：W16.1、W03.4。
- 位置：`packages/kernel/src/plugins/external.ts`、`apps/desktop/src/plugin-host/`、`apps/desktop/src/main/plugin-host-supervisor.ts`、`examples/plugins/{daily-review,quick-clip,portable-export}`。
- 复用：R-52（`EXTERNAL_DEMOS` 元数据）。
- 实现要点：清单校验；权限确认对话框文案（security §6）；复制到 `.huhu/plugins/external`；插件令牌；`activate(api)` 中 `api.call`、`api.registerCommand`；命令出现在命令面板与插件详情；本机信任记录；卸载与“擦除数据”分离；示例：daily-review 用 `tasks.list`+`notes.list`+`notes.create` 生成回顾笔记，quick-clip 用 `inbox.capture`，portable-export 用 `notes.list`+`notes.read` 合并为单个 Markdown 并经命令返回的保存位置写出（通过 `api.saveFile` 请求桌面保存对话框）。
- 异常：插件进程崩溃 → 状态 failed 与重试；超出权限调用 `PERMISSION_DENIED`；同步来的未信任扩展以停用状态加载。
- 测试：ACC-PL-03、04；崩溃隔离测试（插件进程退出不影响 Engine）。
- 完成：两个 ACC 通过；三个示例扩展可安装运行。
