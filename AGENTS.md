# Huhu 项目指令

## 按需启用协作规则

用户明确选用协作规则组时，读取[模型与协作规则](.agents/dev/context/model-roles.md)并应用所选组。未选用时沿用当前会话与工具设置。

## 获取项目 Issue

需要获取 Huhu 项目的 Issue 时，按 [Issue 读取方法](.agents/dev/project/issue-automation/README.md) 使用已配置的 GitHub Issues 来源。用户只提供 Issue 编号时，也在该来源中查找。

## Electron 与 Web 前端

- 涉及 HTML、CSS 或客户端 JavaScript／TypeScript 时，先读取并执行 [zh-modern-web-guidance](.agents/skills/zh-modern-web-guidance/SKILL.md) 的 `search` 与 `retrieve` 流程，再确定实现。这条规则适用于 Electron 渲染进程、Web 端以及两端共享的前端代码。
- Electron 专用前端能力按桌面端实际捆绑的 Chromium 版本核对。Web 端按明确的目标浏览器核对。未指定目标浏览器时，采用 Baseline Widely available，并对范围外的特性遵循指南的回退建议。共享前端改动按两端各自的运行环境验证。
- Electron 渲染进程通过现有 `window.huhuHost` preload 接口调用桌面能力。两端共享的前端代码通过宿主接口访问平台能力，保证浏览器入口能独立运行。

## 强制执行复用优先原则

任何新功能或技术方案都应按以下顺序评估：

```
① Huhu 当前已有实现
         ↓
② temp/sources 中的成熟实现
         ↓
③ 现有成熟开源依赖或框架
         ↓
④ GitHub 上的优秀开源项目
         ↓
⑤ 基于成熟方案的小范围适配
         ↓
⑥ 确实没有合适实现时才自行开发

```

禁止在未检查现有实现的情况下直接设计新的基础设施。

需要项目背景、开发记录或部署证据时，从 [开发资料导航](.agents/dev/AGENTS.md) 找到对应目录。
