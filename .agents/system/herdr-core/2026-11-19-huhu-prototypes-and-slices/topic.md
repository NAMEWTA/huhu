# Huhu #3–#10 切片任务与 HTML 确认稿

## 目标与验收

为八个 change 拆分可独立接手的任务文件并交付可打开、可操作、待用户确认的 HTML。只改计划文档、模拟原型和协作文件。生产实现留待后续。

## 共享位置与身份

本机 Windows Core `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`。Lead 处于外部会话，主动读取报告。共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices。终端目录采用 encodeURIComponent(address)，worker 核对 HC_TERMINAL_ID。
- t11 · GPT-6.2-astra xhigh · #3、#10
- t16 · GPT-6.2-astra xhigh · #4、#5
- t12 · GPT-6.2-astra xhigh · #6、#7
- t17 · GPT-6.2-astra xhigh · #8、#9
- t18 · GPT-6.2-sol xhigh · #3、#10
- t15 · GPT-6.2-sol xhigh · #4、#5
- t13 · GPT-6.2-sol xhigh · #6、#7
- t14 · GPT-6.2-sol xhigh · #8、#9

## 用户已确认

- 用户要求用上游默认分支最新源码、当前 Huhu 检出为标准。原 Issue 固定引用保留历史出处，以 `temp/sources` 及批次来源清单查实际版本。克隆在进行中，可先读现有 Huhu 文件，禁止另行克隆或修改来源文件。
- #6 用户确定局域网邀请在服务开启期间可以重复用，可撤销；关闭服务或换 Vault 后失效，界面提供独立撤销、可见状态/重取链接，具体是否注销已建立的会话若无决定应清楚标注或给可选路径。
- 用户确认产品尚未发布，无需旧格式兼容。#9 不规划旧库迁入、手工转存或兼容入口，按新模型和模块独立认证。其他 issue 不为旧接口/数据格式增设兼容实现。仍规划新格式正常备份恢复，不触碰或删除真实旧数据。
- 原文第三方项目作为授权源码、功能及信息结构的参考。产出使用 Huhu 自有主题、导航、组件和文案，保持可辨识，不复制第三方专有界面或资产。

## 派发后的用户决定

- #5 停用/删除规则只停止未来触发，已入队未发的任务保留，可单独取消。
- #6 干净安装全部 MCP/CLI 工具默认关闭，逐项或明确批量开启。
- #10 桌面和窄屏共用一套布局。窄屏只提供顺序与尺寸调整，结果写回同一布局。不另存断点专用布局。

这些已经确认，替换原设计里的相应待决状态。用户尚未确认任何 HTML 版本。

## 源码与本机浏览器已就绪

- 最新源码清单位于 .agents/dev/changes/2026-11-19-huhu-issues-3-10/sources.md，12 个 checkout 已核对，含 ORCA main、Motty 和 Viva。
- 本机浏览器工具已就绪。可从工作区 require('./temp/prototype-qa/node_modules/playwright-core')，浏览器为 C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe，验证过无界面启动和点击。使用 file URL 打开本任务实际原型。

## 用户确认的撤销与离场交互

- #6 撤销局域网邀请时，旧链接立即失效，并一起断开通过该邀请建立的现有浏览器会话。其他入口和由其他有效邀请独立建立的会话不受本次撤销影响。
- #10 带未保存改动切换模块或关窗口时，询问保存、放弃或继续编辑。保存失败留在原地并保留草稿。

## Lead 验收

八份报告均已回读，验收通过。核对了 12 个上游 checkout、238 份任务与 408 条显式前置链接、8 个离线 HTML 入口与确认指纹。用户对具体 HTML 版本仍待确认。 [交付总览](../../../dev/changes/2026-11-19-huhu-issues-3-10/program.md)
