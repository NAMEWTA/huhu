# Huhu 开发环境与资源记录

2026-11-24 15:03–15:06（UTC+08:00）在 `wta-ubuntu` 采样。本次 Lead 运行于该机的 Orca 终端。目标检出为 `/home/wta/projects/huhu` 的 `main`，采样时 HEAD 为 `e8008bf4c805`。该主机为 VMware 虚拟机，以下预算适用于来宾系统。

Lead 按项目指令管理本机所有 Huhu 检出的共享额度。准入前同时核对 Herdr Core 终端、Core 外进程和 Git 检出登记。 [项目指令](../../../AGENTS.md)

## 工具链

| 项目 | 本机核验 |
| --- | --- |
| Node 与 pnpm | 默认 Node 为 `26.11.1`，满足项目 `>=24` 的要求。用已安装的 `24.22.1` 对齐 CI 的 Node 24。pnpm `12.10.1` 与项目固定版本及安装元数据一致。已安装的 workspace 锁与根锁文件中的 workspace 文档解析结果一致。 [项目清单](../../../package.json) · [CI](../../../.github/workflows/ci.yml) · [锁文件](../../../pnpm-lock.yaml) |
| Linux 开发环境 | Ubuntu 26.04.1 LTS，x86_64，内核 `7.0.0-43-generic`，Git `2.53.0`。Go `1.27.1` 满足原生 PTY 模块的 `1.26.0` 最低要求。Linux 发布 CI 固定使用 Go `1.26.7`。 `xvfb-run` 和 `xauth` 均可用。 [Go 模块](../../../native/agent-pty/go.mod) · [发布 CI](../../../.github/workflows/release.yml) |
| 测试和桌面依赖 | Vitest `3.2.7`、Playwright `1.65.0`、TypeScript `5.9.3` 和 Electron `44.9.1` 已解析。桌面有 Electron 可执行文件及现有的 main、preload 和 Web 构建产物。 [项目清单](../../../package.json) |
| Herdr Core | 编排 CLI 和默认 Core 为 `0.1.22`。项目内置 Linux x64 二进制为 `0.1.19`，其本地标记与项目锁一致。 [Herdr 锁文件](../../../scripts/herdr.lock.json) |
| Agent CLI | Codex `0.172.0`、Claude Code `2.1.330`、Pi `1.6.0` 可执行。Codex 本机目录列有 `gpt-6.2-astra / high`、`gpt-6.2-sol / xhigh` 和 `gpt-6.2-sol / medium`。Claude CLI 支持 `medium` 推理档。原团队指定的 Claude 型号和各模型的实际推理仍待会话验证。 |

## 有效资源

| 维度 | 实测与准入依据 |
| --- | --- |
| CPU | 8 个逻辑 CPU。执行 Shell、Core 及已查验的 holder 亲和性均覆盖 8 核，可见父 cgroup 无有限 CPU 配额。依据 `nproc`、进程亲和性和 cgroup v2 控制项。 |
| 内存 | 总量 30.29 GiB，15:06 的 `MemAvailable` 为 23.64 GiB，分别高于 12 GiB 和 20 GiB 启动线 11.64 GiB 和 3.64 GiB。Shell、Core、holder 及可见父级的 `memory.high` 和 `memory.max` 均无更紧的有限值。内存 PSI 近 10 秒为 0，已用 swap 约 0.36 GiB，准入口径只计 RAM。 `systemd-oomd` 正在运行。 |
| 磁盘和 inode | 仓库、依赖、pnpm/Go/Electron/Playwright 缓存、构建与测试产物和临时目录同在 `/dev/sda2` 的 ext4 卷。可用 136.05 GiB，磁盘使用率 52%，inode 使用率 16%，约有 1653 万个 inode 可用。按一份共享余量核算。项目门槛为每个相关卷可用空间至少 40 GiB，磁盘使用率至多 85%，inode 使用率至多 90%。依据真实路径的 `df -h`、`df -Pk` 和 `df -i`。 |
| 进程数 | 采样的执行 Shell 及 Core 服务最紧的 `pids.max` 为 37,170，采样最大占用为旧 holder 的 135。共同父级当时约占 1,138 / 81,774。此项计数包括线程。 |

## 准入预算

| 类别 | 当前占用或预留 | 项目上限 | 当前可新增 |
| --- | --- | --- | --- |
| Agent CLI | 当前 Huhu Lead 1 个。两套旧验收各存活一个 Codex app-server，暂按两个后台名额预留。 | 3 个，含 Lead | **0** |
| 验证或重负载 | 两套旧验收的 Electron 和 Codex 进程仍存活，串行名额待归属及退出状态核清。 | 1 项 | **0** |
| Git worktree | 主检出 1 个，含依赖、产物和临时文件约 8.0 GiB。 | 3 个 | **2 个仅检出** |

新增检出按 `git worktree list --porcelain` 计数。当前 HEAD 有 5,790 个 blob，共约 69.4 MiB，两个普通检出有磁盘与 inode 余量。依赖安装和验证使用同一重任务名额，逐项重新准入。主检出的 `node_modules` 约 1.4 GiB，供估算新检出的额外占用参考。

单个 Agent、构建、类型检查和 E2E 的进程树峰值待校准。现有历史样本为类型检查、E2E 与打包叠加约 27 GiB，由 `systemd-oomd` 终止任务组。单测 Vitest 最多 3 个 worker，Playwright E2E 固定 1 个 worker。 [资源和测试约束](../../../AGENTS.md) · [Vitest 配置](../../../vitest.config.ts) · [Playwright 配置](../../../playwright.config.ts)

## 在途预留与释放

| 用途 | 本机实例 | 当前计入与释放条件 |
| --- | --- | --- |
| 本次 Huhu Lead | Orca 中的同一交互会话，Codex PID `3107464`，14:51 启动 | 占一个会话名额，会话结束后复核。 |
| 旧验收 Electron 环境 | `huhu-closeout-native-history.T3jlkR` 的独立 Core `t1`，Core PID `2711899`，Electron `2711910`，Codex `2711922`，11 月 23 日 13:23 启动 | 归属核清后，由负责人回收该验收进程树。确认终端、Electron 和 Codex 均退出后释放预留。 |
| 旧验收 Electron 环境 | `huhu-closeout-native-history.TgbrDg` 的独立 Core `t1`，Core PID `2745923`，Electron `2745934`，Codex `2745946`，11 月 23 日 13:57 启动 | 归属核清后，由负责人回收该验收进程树。确认终端、Electron 和 Codex 均退出后释放预留。 |

默认 Core 的 `hc ls --all` 显示 0 个活跃终端。另对两个验收 Core 各自查询，均有 1 个活跃终端，进程树也已核对。系统可用内存读数已包含常驻 Codex 服务和沙箱辅助进程的占用。现存主检出及旧验收进程保留，回收项归原任务负责人核实。

## 最小验证与复测

- 通过默认 Core 的 `hc exec` 和 `volta run --node 24.22.1`，实际核对了 Node、pnpm、Vitest 和 Playwright 的版本入口，均成功退出。另核对了已安装 workspace 锁、Electron 文件和项目内置 Herdr 版本。
- 创建检出、派发或重任务启动前，Lead 复测 `MemAvailable`、实际任务及父 cgroup 剩余量、`df -h`、`df -i`、每个相关 Core 的活跃终端及 Core 外进程。恢复会话、回收、依赖或主机变更、内存压力或 OOM 事件后刷新本记录的准入判断。
- 创建检出、启动 Agent 或定向单测使用 12 GiB 启动线。E2E、开发服务器、构建、打包、批量安装和全仓检查使用 20 GiB 启动线。重负载期间可用内存低于 6 GiB、出现 OOM 告警或相关卷不再满足磁盘门槛时，按项目指令停止本任务的重负载并保留证据。 [项目指令](../../../AGENTS.md)

## 未运行的验证

- 定向单测、E2E、类型检查、构建、打包和依赖安装验证，待旧验收进程退出后重新判断串行名额。
- 新 Agent 会话及模型请求、桌面应用行为、远端主机资源和 VMware 宿主配额。
