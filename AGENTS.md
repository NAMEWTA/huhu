# Huhu 项目指令

##  编排规则

使用 Herdr Core 编排，按 `.agents/skills/system-herdr-core/SKILL.md`、`.agents/dev/context/model-roles.md` 和本机 `hc --skill` 操作。主会话沿用启动模型；疑难分析用 `gpt-6.2-astra / high`，实现用 `gpt-6.2-sol / high`，独立审查用 `gpt-6.2-sol / xhigh`。Codex 使用 `--no-daemon`，不用 fast，不传 `-c service_tier=fast`，也不从旧模板继承 fast 或权限绕过参数。最多保留 4 个 worktree。

## 测试与内存约束

- 开发过程中只运行自己改动涉及的测试（如 `pnpm vitest run <路径>`），不跑全量套件。
- 全量测试只在全部改动完成、收尾时统一跑一次；同一时刻只允许一个 worktree 跑全量测试。
- 并发由根目录 `vitest.config.ts` 限制为 `maxWorkers: 3`，不要用命令行参数调高。
- 起因：多个 worktree 并行跑测试曾耗尽内存，被 systemd-oomd 整体杀掉 hc 的所有智能体。

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
