# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t10（p4-linux）
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10/report01.md
- 执行结果 — blocked

## 结论

Linux x64 的受控 Codex 派遣、原生问答、结果回执和受保护规则启动已验证。真实 Codex 0.170.0 经回环 Responses 询问并接收选项，原 Task 只落一条最终结果，凭原 Core 地址和原生 thread/turn 对账。两条点名的回执用例在真实 Core 0.1.19 上使用原有合成 App Server 通过，覆盖 MCP 与 CLI 共用原会话以及双 ACK 丢失后只消费原输入。

交互凭据启动仍需要具备内层 PTY 和进程树回收能力的 POSIX 宿主。CLI/MCP 的外部终端规则批准也仍受 Automations 的 Windows PowerShell 限定。两项保留拒绝行为，联验①的桌面安装包验收尚未完成。

## 产物与改动

- 候选提交 — `2a1700941bd947d7241233c9ce4c1b725af92a95`
- 父提交 — `22e914329e16d1cc2a7dc6338cd78cc13787eade`
- 工作区 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-agent-linux`。候选由临时索引生成，分支 HEAD 仍指向父提交。业务文件与候选树内容一致。工作区中的 `.agents` 是只读挂载，证据文件已通过 Git blob 纳入候选树。
- 证据 — `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/verification/W-linux-native-execution.md`。记录每个测试文件的计数、命令、运行环境、Windows 分支的保护目的与 Linux 对应证据。
- 改动范围 — Agent CLI 的受控派遣和受保护规则 helper、对应测试与夹具，以及点名的 Engine 和 CLI 测试。

| 原 Windows 条件 | Linux 对应行为与证据 |
| --- | --- |
| `codex-dispatch.ts` 原生 EXE 与 Windows 命名管道 | Linux x64 验证真实 ELF 指纹及版本，要求独立且由当前用户持有的私有 Codex HOME。Unix socket 位于私有目录，地址随 HMAC 签名的 thread/PID 回执。原进程绑定、一次性启动记录和挑战验证继续覆盖派遣、答复及停止。 |
| `protected-launch.ts` 与 helper 的 Windows 控制台和环境名覆盖 | Windows 保留控制台中继与不区分大小写的覆盖。POSIX 直接启动 helper，以白名单和批准变量组装环境，使用明确的 stdio 配置，仍复核继承目录和遮蔽输出。Core 实测找到原终端、没有传入环境诱饵、公开记录无测试值，重放票据退出 1。 |
| `interactive-environment.ts` 的 Windows x64 原生路径和 broker | Windows 分支依赖可执行映像、创建时间、内层 ConPTY、私有启动确认及 Job 回收。Linux 暂无等价受保护交互宿主，本轮实测的 POSIX 规则 helper 使用 stdout/stderr 管道。 |
| 旧测试的 Windows 夹具与外部审批限定 | 用 POSIX shell、目录符号链接与专用 Core socket 覆盖共享场景。保留 Windows 目录长度边界断言和外部 PowerShell 批准用例。Linux 外部批准回归观察到拒绝且无新会话。 |

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 点名 live、规则和对账用例 | 11 文件，34 通过、0 失败、1 跳过。仅跳过原 Windows PowerShell 外部批准用例。Native receipts 三项均通过。 | [点名测试日志](/tmp/huhu-t10-run.FqcFTP/test.log)；候选证据含各文件计数 |
| 真实原生工具 | Linux x64 Codex 0.170.0 实际完成一次结构化问答。Pi 1.5.2 在独立 Core 的外层 PTY 离线运行，`/session` 为内存会话且零消息，`/quit` 退出 0。 | [Codex 测试](/tmp/huhu-t10-run.FqcFTP/test.log) · [Pi 输出](/tmp/huhu-t10-pi-live.3kEcnv/session.log) |
| `pnpm test` 前后全量 | 父提交归档快照 1615 通过、0 失败、62 跳过。候选初轮 1631 通过、1 失败、48 跳过，失败为 SSH 转发。该文件单独复跑 4/4，通过后同一候选 `pnpm test --maxWorkers=3` 全量复跑 1632 通过、0 失败、48 跳过。每轮另有 Node 脚本 23 项通过。 | [基线](/tmp/huhu-t10-run.dbZWFa/test.log) · [候选初轮](/tmp/huhu-t10-run.gRFPz5/test.log) · [SSH 单独复跑](/tmp/huhu-t10-run.uYJQiL/test.log) · [候选全量复跑](/tmp/huhu-t10-run.ZL1CC4/test.log) |
| 静态检查 | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 均退出 0。 | [typecheck](/tmp/huhu-t10-run.yyg41C/test.log) · [lint](/tmp/huhu-t10-run.9opogg/test.log) · [format](/tmp/huhu-t10-run.9bRi00/test.log) · [knip](/tmp/huhu-t10-run.JiaQB2/test.log) |

使用临时 Vault、隔离 HOME、CODEX_HOME 和 XDG_RUNTIME_DIR，Engine 凭据走现有测试注入点。模型请求由 127.0.0.1 上的合成 Responses 服务处理。macOS、Windows 运行回归、Linux arm64、随包启动与本机钥匙串均未测。

## 阻碍与接续

1. **桌面定位与受控配置。** 现有 Engine 装配读取 `HUHU_NODE_BIN`、`HUHU_CODEX_DISPATCH_HELPER`、`HUHU_CODEX_DISPATCH_BIN` 和 `HUHU_CODEX_DISPATCH_HOME`。Lead 在桌面安装入口接入匹配指纹的 Linux ELF 和应用拥有的私有目录，并核对应用内 Node 模式、随包 helper 和真实启动。当前已验证的 Codex 指纹记录在证据中。
2. **交互受保护启动。** POSIX 宿主需要覆盖内层 TTY/resize、Core 根进程绑定、批准文件/目录固定、私有的已消费和已启动回执、后代回收。本机沙箱的非特权用户/PID namespace 探针返回 `Operation not permitted`，cgroup 只读。这轮保留 Windows 宿主门槛。Linux 和 macOS 的等价宿主及包内路径待补。
3. **外部终端规则。** `plugins/automations/src/engine/terminal-environment.ts:219` 将批准绑定到已迁移的 Windows PowerShell 规则。Lead 需为 POSIX 规则定义同等批准和轮换语义后复跑 CLI、HTTP MCP 与 stdio MCP。候选已验证 Agent CLI 的 POSIX 规则 helper 和当前授权拒绝边界。
4. **同包联验。** 在最终安装包中完成 MCP-only 与 CLI-only 旅程，保存原 Task 和原会话身份，并在原桌面会话定位、人工完成之后再次读取结果。当前 ACK 故障注入证据来自 Engine 和真实 Core 的合成 App Server 测试。

## Lead 验收

由 Lead 在验收后追加。

Lead 验收（2026-11-21）：实现与证据通过 Lead 核对；候选 `2a170094` 与工作树一致（三个新文件逐字节相同），已快进并合入集成 `7344d3e5`。独立审查排入下一轮。交互受保护启动的 POSIX PTY 宿主列为后续任务；本轮先处理独立审查对 CLI 自启动 Engine 的两项发现（task02）。
