# Huhu 项目指令

## 按需启用协作规则

用户明确选用协作规则组时，读取[模型与协作规则](.agents/dev/context/model-roles.md)并应用所选组。未选用时沿用当前会话与工具设置。

## Electron 与 Web 前端

- 涉及 HTML、CSS 或客户端 JavaScript／TypeScript 时，先读取并执行 [zh-modern-web-guidance](.agents/skills/zh-modern-web-guidance/SKILL.md) 的 `search` 与 `retrieve` 流程，再确定实现。这条规则适用于 Electron 渲染进程、Web 端以及两端共享的前端代码。
- Electron 专用前端能力按桌面端实际捆绑的 Chromium 版本核对。Web 端按明确的目标浏览器核对。未指定目标浏览器时，采用 Baseline Widely available，并对范围外的特性遵循指南的回退建议。共享前端改动按两端各自的运行环境验证。
- Electron 渲染进程通过现有 `window.huhuHost` preload 接口调用桌面能力。两端共享的前端代码通过宿主接口访问平台能力，保证浏览器入口能独立运行。

## 优先复用已有实现

新增功能或技术方案时，先查 Huhu 的现有实现，再查 `temp/sources` 中的参考实现、成熟的开源依赖或框架，以及 GitHub 上的开源项目。已有方案能满足需求时直接复用或做小范围适配。评估后没有合适方案时再自行开发。

需要项目背景、开发记录或部署证据时，从 [开发资料导航](.agents/dev/AGENTS.md) 找到对应目录。
