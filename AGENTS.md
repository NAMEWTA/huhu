# Huhu 项目指令

## 编排规则

使用 Herdr Core 编排，按 `.agents/skills/system-herdr-core/SKILL.md` 和本机 `hc --skill` 操作。分工、前端实现和同一 Bug 两次修复失败后的升级，按[模型角色分工](.agents/dev/context/team/huhu-development-gpt.md)执行。Codex 使用 `--no-daemon`，不用 fast，不传 `-c service_tier=fast`，也不从旧模板继承 fast 或权限绕过参数。

## 本机资源硬限制

本机有 8 个逻辑 CPU、约 30 GiB 内存。2026-11-22，类型检查、E2E 和打包叠加，内存峰值约 27 GiB，`systemd-oomd` 终止了整个 Herdr Core 任务组。以下上限由 Lead 在本机所有 Huhu 任务间统一执行，不按分支、worktree 或 CLI 分别计算。

- **最多 3 个 Git worktree：主检出 + 2 个额外检出。** 集成、复现、空闲和保留检出都计数。用 `git worktree list --porcelain` 核对；到上限就复用或排队，不为只读审查另开检出。
- **最多 3 个同时存活的 Agent CLI 会话：1 个 Lead + 最多 2 个 worker。** Codex、Claude Code、Pi 等合计，顾问、空闲会话和后台会话也占名额。启动前用 `hc ls` 和进程列表核对本项目会话，包括 Core 外的会话。worker 不得自行再派发。不能确认有空位时，不新开会话。
- **同机一次只运行 1 项验证或重负载任务。** 单测、E2E、类型检查、构建、打包、依赖批量安装和独立开发服务器共用同一名额。E2E 自带的服务计入该项任务，并随测试退出。禁止通过脚本并行启动这些任务；根目录 `pnpm typecheck` 使用了 `--parallel`，需要全仓类型检查时由 Lead 逐包串行执行。
- **启动前检查内存和磁盘。** 创建 worktree、启动 Agent 或运行定向单测前，系统 `MemAvailable` 至少为 12 GiB。启动 E2E、开发服务器、构建、打包、批量安装或全仓检查前，至少为 20 GiB。实际任务及各级父 cgroup 存在有限的 `memory.high` 或 `memory.max` 时，该组的剩余量也须达到同一门槛，不把 swap 算作可用内存。用 `free -h` 或 `/proc/meminfo` 检查内存，并用 `df -h`、`df -i` 检查仓库、产物目录、依赖缓存和临时目录所在卷。每个相关卷至少有 40 GiB 可用空间，且磁盘和 inode 使用率分别不超过 85% 和 90%。预计写入后会跌破门槛就不启动。
- **资源不足时停派。** 启动门槛不满足就等待或回收本任务已完成的资源，不能调高并发。运行重负载任务期间复查内存和磁盘。可用内存降到 6 GiB 以下、出现 OOM 告警或磁盘跌破上述门槛时，Lead 停止本任务的高负载进程，保留日志与改动，重新满足启动门槛后再继续。不得为腾资源终止其他任务或删除他人的文件。

### 验收后必须回收

1. 临时 worker 验收后，Lead 关闭无需复用的 Agent CLI，回收它的 Herdr Core 终端，并确认测试、Electron、浏览器和开发服务器没有残留进程。任务结束时不留本任务的空闲 worker。
2. 确认改动已合入或有可恢复的提交，保全需要的验收证据。检查 worktree 中的未提交、未跟踪和忽略文件，只清理本任务可再生成的依赖副本、构建产物、测试输出和临时目录，然后用 `git worktree remove <路径>` 回收本任务的额外检出。不得强删有未保存改动、仍在使用或归属不明的检出，也不得删除共享缓存。
3. 用 `git worktree list --porcelain`、`hc ls --all` 和 `df -h`、`df -i` 复核回收结果。无法安全回收时，报告保留的路径、占用和原因；保留项仍计入上限。

## 测试范围与职责

- **开发阶段只跑受改动影响的用例，不跑全量单测或全量 E2E。** 单测用 `pnpm exec vitest run <测试文件>`。需要 E2E 时，由 Lead 按 spec 路径运行，必要时用 `-g` 缩到具体用例，例如 `pnpm e2e <spec 路径> -g '<用例名>'`。
- **只有最终验收才运行全量套件。** Lead 先回收已完成的 worker，再在一个验收 worktree 中按交付要求对整合版本串行运行完整套件。每个套件在同一候选版本上集中跑一次，不在全量验证期间另行派发。Vitest 的 `maxWorkers` 不得超过根配置的 3；Playwright E2E 固定为 1 个 worker。
- **实施者只运行定向单测，每次一个文件。** 实施者编写业务代码、单测和对应的 Playwright spec。E2E 只写不跑，报告中列出需由 Lead 执行的 spec 和用例名。实施者不得运行构建、打包、安装包检查、全仓类型检查、全仓 lint、`pnpm knip` 或视觉截图取证。
- 报告须单列未运行的验证，不得将其记为通过。

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
