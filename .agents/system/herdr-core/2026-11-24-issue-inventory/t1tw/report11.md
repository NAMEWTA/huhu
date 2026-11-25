# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task11.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task11.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report11.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/042-s4.md、090-s5.md，待 Lead 更新
- 执行结果 — done

## 成果与运行指针

- 工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，从 `ca76ada3` 快进到派发基线 `e29cd416`。最终 HEAD 为 `9d9ed1d53349827c2aeafa45e039f6a1781931b6`，工作树干净。`git diff e29cd416..HEAD --check` 通过。
- 本轮测试原件目录为 [/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task11](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task11)。使用共享验证锁 `/home/wta/projects/huhu/temp/dev/verify.lock` 串行运行下列命令。

### 042-s4 · 文件与传输回归

- 提交 `a395aab1724f1e4d1548aad5901869ba971f3b76`。
- H7.2 的定位器沿用 `ed17bce6` 的按钮角色，S3 `ad51040a` 将工作区标签改为 `tab`，S4 `d55af36d` 未改动该角色。改为通过 `tab` 定位跨端目标，并修正 H7.1–2 和 H7.3 后续切换的同类问题。
- H7.1–2 的 `first().partial` 等待来自 `6e99e78a`，上传批次和下载批次都可处于 `partial`，重新打开中心时该断言可先匹配缓存的上传批次。改为等待包含 `pulled.txt · 已完成` 的下载批次并核对该批的链接跳过及实际文件，跨端批次按返回的 batchId 等待。Lead 日志记录的是读文件 ENOENT，尚待重跑证明此时序定位。S4 未修改传输队列和拖放逻辑。
- H7.3 自 `11d7b576` 通过只读 Hook 取归档能力，`133dfc0b` 将探测升级为 `execute`，原 UI 未附带幂等键。改用现有 EngineClient 写调用选项和可取消请求，按原文件会话探测，明确公布结果。Linux 上断言实际不可用反馈、禁用按钮和原件，Windows 仍保留原 ZIP 清单、哈希、解压和不覆盖断言。
- 对照 SSH UI 与能力描述符，补齐交互认证提交或取消、本地 Shell 打开或关闭、代理分享检测或启动、测试、停止所需的幂等键。复用现有 idempotency 语义，未改能力范围。
- 改动文件为 `plugins/ssh/src/ui/{ArchiveTools,AuthenticationDialog,LocalShellPanel,ProxySharePanel}.tsx`、`tests/e2e/workflows/ssh-workspaces.spec.ts`。
- `volta run --node 24.22.1 pnpm --filter @huhu/plugin-ssh run typecheck` 通过。`volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/transfer-publication.test.ts` 6/6 通过。

Lead 待运行的 `tests/e2e/workflows/ssh-workspaces.spec.ts` 用例如下。Playwright `--list` 已识别 3 条。

1. H7.2 两个回环端点按前缀续传、暂停和继续，前缀失配保留原目标
2. H7.1–2 批量目录逐项确认，拖放保留内容并阻止链接逃逸
3. H7.3 ZIP 探测报告本机支持状态，支持时验证原设备的归档内容和错误

### 090-s5 · 转发与监控

- 提交 `9d9ed1d53349827c2aeafa45e039f6a1781931b6`。
- A10 沿用 Huhu 四模式转发、专用连接持有者与显式 Resume，比照 Motty `internal/portforward/forward.go` 的回环约束与流统计。扩展工作台用例，经本机回环 SSH 和真实 TCP echo 核对四模式双向字节、停止单条时共享模式仍工作、最后一个持有者退出并释放监听。定向引擎测试另覆盖端口冲突、服务端拒绝和断跳后显式 Resume。
- A11 沿用原 Pane 和已启动仪表盘的一次采集。比照 Motty `internal/remotestats/stats.go`、`details.go`，Linux 同次从 procfs 取每核 CPU 和网卡流量，两次有效读数后才显示，计数回退不填假零。明细限 64 核和 16 个非回环接口，仅放最近样本，历史继续保留聚合指标与空隙。
- 复用原分栏令牌及服务器工具的固定只读命令边界，参照 Motty `internal/remotetools/docker_resources.go` 增加镜像标签和大小。镜像、容器和进程保持原 hostId/shellId，镜像支持同 ID 多标签，命令缺失和权限错误分别处理。新增真实 Linux procfs 定向用例，Docker 内容由回环 SSH 夹具提供。
- 统一计划继续拥有仪表盘周期和启停。扩展运行中从自动化中心改期的定向断言，两个面板共享 SSH 源，改期未增加连接。独立 Web 读取同一仪表盘的指标和历史，桌面原有分栏工具及运行控制的权限保持有效。Web 侧栏明确提示可用入口，仪表盘跟进桌面后续启动及周期改动。面板定义的原有编辑行为可继续使用。
- 改动文件为 `plugins/ssh/src/engine/{capabilities,monitor-sample,monitor-tools,monitors}.ts`、`plugins/ssh/src/shared/monitoring.ts`、`plugins/ssh/src/ui/{MonitorDashboard,MonitorSidebar,MonitorTools}.tsx`、`plugins/ssh/test/monitor.engine.test.ts`、`tests/e2e/ssh/{forwarding,monitoring}.spec.ts`。
- `volta run --node 24.22.1 pnpm --filter @huhu/plugin-ssh run typecheck` 通过。`volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/forwarding.engine.test.ts` 4/4 通过。`volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/monitor.engine.test.ts` 4/4 通过。`volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t 'isolates monitor subscriptions and keeps active query output out of receipts'` 2/2 通过，覆盖授权 CLI 和 HTTP MCP。
- Modern Web Guidance 用于归档探测的状态直播区域、原生 details 折叠和工具选择的 aria-pressed 状态。

Lead 待运行的用例如下。Playwright `--list` 已识别 3 条。

1. `tests/e2e/ssh/forwarding.spec.ts` — A10 Workbench forwards bytes in all four modes and releases each loopback listener
2. `tests/e2e/ssh/monitoring.spec.ts` — Workbench monitors a saved panel in the background and controls the active Pane separately
3. `tests/e2e/ssh/monitoring.spec.ts` — A11 独立 Web 查看两个主机的桌面采样，采样控制由桌面管理

## 阻碍与接续

- 本轮未运行实际 Electron 或独立 Web E2E、构建、打包、全仓检查和视觉取证。H5.2 已按派发暂停，现有用例与实现未作专项修改。
- S4 的 Linux 桌面 ZIP 能力目前确实不可用，已提交的验证分支覆盖该反馈。独立原生文件窗口、外部编辑器、SCP 回退、文件 sudo 与真实 Zsh 验证仍待覆盖。
- S5 的独立 Web 还没有分栏实时采样、工具查询及仪表盘运行控制。P07 ViaShell、独立工具窗口、进程变更、Docker 日志与容器终端、监控与工具的独立 sudo、更多硬件与系统指标仍待实施或验证。本轮未在外部 SSH 服务、真实 Docker daemon、macOS 或 Windows 主机执行。
- 后台计划的运行中改期、历史空隙、授权边界及监听释放有本机定向证据，E2E 和部分功能缺口待 Lead 按票复核。

## Lead 验收
- Lead 2026-11-25：合入 main f8f9751a；SSH 41 条 38 通过，派 task12。
