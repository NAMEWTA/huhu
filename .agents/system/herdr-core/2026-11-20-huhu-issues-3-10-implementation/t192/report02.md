# Windows 内层 ConPTY 与单次交付验证

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t192`，与本机 `HC_TERMINAL_ID` 一致
- task — `task02.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/report02.md`
- 执行结果 — **done（独立本机探针）**

## 结论

**固定 Herdr Core 0.1.19 上，受信宿主可以在内层 ConPTY 中保留真实控制台交互，并在输出进入外层 Core 前遮蔽合成值。** 两轮独立运行各完成四个场景。成功场景中，测试操作者从 Core attach 看到了**没有换行的** `CLI_INPUT>` 提示符，发送 `ping` 后收到了子进程的 `CLI_PONG`。子进程对 stdin、stdout、stderr 三个句柄逐个调用 Windows `GetConsoleMode`，全部成功。内层 stderr 回显的完整标记被替换一次，外层 attach 与 Core 屏幕只看到了 `[REDACTED]`。首轮结果（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/task02/legacy-7984bff4/probe02/result.json`） · 独立复跑（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/task02/legacy-7984bff4/probe02/repeat.json`）

**此次交付给已运行、能配合握手的合成 CLI。** 子进程出生时没有该变量，宿主先核对其 PID 与内核创建时间，再发送合成值，由子进程写入自己的环境并读回。这个实验回答了握手、单次交付与交互能否共存；不会握手的任意第三方 EXE 能否在程序入口直接继承同等约束的环境，仍需针对该启动方式另验。未运行 Pi 或任何真实 provider，未访问其他机器。

## 验证

| 场景 | 有意改变的条件 | 两轮共同观测 |
| --- | --- | --- |
| 成功 | 两级连接均使用实际 PID 与创建时间 | 签发进程向外层宿主交付一次，宿主向内层子进程交付一次。两级接收者均在单帧后读到 EOF，关闭旧句柄后第二次打开同名端点，Windows 返回 `ERROR_FILE_NOT_FOUND`。attach 可输入，CLI 与宿主正常退出 |
| 外层创建时间错误 | 保持 Core 所报 PID，将签发进程预期的创建时间加一个 FILETIME 单位 | 签发进程零交付；宿主显示 `FIXTURE_DENIED`，退出码 23，未启动内层 CLI |
| 内层 PID 错误 | 保持内层真实创建时间，预期 PID 改为本探针自己的宿主 PID | 外层已领取，内层交付被拒绝。子进程确认环境变量仍缺失，未进入命令循环，宿主记录 `INNER_REJECTED_ZERO` |
| 内层创建时间错误 | 保持正确的内层 PID，预期创建时间加一个 FILETIME 单位 | 同样零交付给内层，子进程确认变量缺失。两个内层拒绝测试的宿主退出码均为 0，表示完成了预期的拒绝断言 |

**输出证据。** 每个场景生成独立的无价值随机标记。成功场景从环境读回标记，分两次写入内层 stderr，中间间隔 60 ms。过滤器每次最多读 11 字节，远小于 45 字节标记；它只暂存仍可能组成标记的前缀，透传其他字节。两轮均在释放外层输入前读到了提示符，完整原值及其随机部分的两个 16 字符半段均未出现在公开输出。原始 attach 字节跨帧拼接后检查，并与独立的 `terminal.read` 屏幕回读核对。[过滤器与子进程](probe02/main_windows.go) · [attach 与磁盘检查](probe02/run.cjs)

**落盘证据。** 探针在每次删除终端前读取私有 Core JSON，四个场景的 restart_env 均为空或省略，实际 argv 与提交的公开 argv 一致。每轮四个场景分别扫描了 5、6、7、8 个当时可读的 Core 运行文件，检索 UTF-8 和 UTF-16LE；Core 视图、原始 attach、屏幕、签发诊断及这些文件均未检出合成原值。启动时私有的 `core.lock` 在运行中被 Windows 独占，初次取证遇到 `EBUSY`。最终探针保存该路径，在停服后逐个标记补扫，两轮读取的锁文件均为 27 字节且无匹配。这些证据的范围是本次私有运行目录和观测到的通道。

## 实际路径与复用落点

1. JS 驱动运行现有 Huhu `HerdrCore.ensure`、`terminal.run`、`terminal.list` 和 `attachTerminal`。每轮使用新的 Core 管道、临时 HOME、cwd 和状态目录，Core 仅获得公开 argv；合成值只经签发进程私有 stdin 进入探针。驱动用唯一标签核实只有一个根终端，并独立读取该测试映像的 OS 创建时间。
2. 两级 Windows 命名管道都要求首个实例、当前用户 SID、拒绝远程客户端。收发两端分别查询系统报告的对端 PID，核对进程创建时间、仍存活状态和探针映像路径。内层用 `CreateProcessW` 返回并持有的句柄取得预期身份。单连接最多写一帧，收到消费确认后关闭。本例的映像路径等值检查限于同一份本机固定夹具；安装包的签名、文件身份与替换竞态仍属产品职责。
3. 原生宿主创建内层 ConPTY，通过 `PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE` 启动固定子程序。子进程以 suspended 状态创建，加入设置 `KILL_ON_JOB_CLOSE` 的 Job 后再恢复。输出先经过宿主过滤，再进入外层 Core。探针只接受固定命令 `ping`。可复用的是进程/管道绑定、ConPTY 启动顺序和输出边界；生产授权、ModuleCredentials、requestId 的持久对账、resize、中断、复杂 VT/编码和跨崩溃恢复均不在此次成功断言内。[原生探针](probe02/main_windows.go)

## 版本、工具链与许可

| 来源 | 本机核对与使用范围 |
| --- | --- |
| Huhu integration | `285cd6f6af477779a4aefda1a6e6556f51d91b5c`，仓库 LICENSE 为 GPL v3。只读调用 `plugins/agent-cli/src/engine/herdr-core.ts` 与 `packages/herdr-client/src/{client,index}.ts`，沿用现有 Core 生命周期和 attach 协议。没有执行 integration 构建。 |
| Herdr Core | Apache-2.0。应用固定 0.1.19，exe SHA-256 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。每轮都校验哈希及 server.status。固定标签提交 `06793ede1bedb1fed8d22d3cae476d3eb239edf0` 的 `crates/herdr-core/src/platform/windows.rs:920–1014`、`holder.rs:310–351`、`api/run.rs:173–178` 已由本终端 task01 核对。本轮沿用其精确文件记录并实跑发布版。当前本地浅克隆为 `c7517808` / 0.1.21，两者的 Windows 文件 blob 不同；本轮没有联网重新拉取。项目随包 ConPTY 的许可和 NOTICE 均保存在 `apps/desktop/resources/herdr/win32-x64`。内层使用 Windows 系统 ConPTY API。[固定源码身份](core-source.json) · [前次核对](report01.md) |
| ORCA | MIT，`8bc232f5ed8b4b36fec0c5f0f85ab96b4c0ccdf3`。阅读 `src/main/windows/windows-pty-job.ts` 与 `config/patches/node-pty@1.1.0.patch` 的 PTY/Job 绑定，核对其锁定、带补丁的 node-pty 1.1.0。用于选择进程树所有权，未编译或分发 ORCA 代码。 |
| Win32 绑定与原生实现参考 | 实际链接本机缓存 `golang.org/x/sys/windows v0.50.0`，提交 `00227f1d192842e243cba7763c1f9a1fcb1c4344`，BSD-3-Clause。使用 `syscall_windows.go` 的 ConPTY 和 `exec_windows.go`、`zsyscall_windows.go` 的进程属性、管道、句柄及 Job API。按本机 Microsoft hcsshim `v0.15.0-rc.1`、提交 `5f3f9b51d76ca61726d4a73d1c00aa83b8dd477e` 的 `internal/conpty/conpty.go:33,71` 对照两对管道、伪控制台属性和句柄释放；其许可证为 MIT，未链接其 internal 包。[Go 许可](probe02/LICENSE-Go.txt) · [x/sys 许可](probe02/LICENSE-x-sys.txt) · [hcsshim 许可](probe02/LICENSE-hcsshim.txt) |
| 构建环境 | Windows x64 10.0.26300、Go 1.26.7、Node v24.21.0。另核实 Rust/Cargo 1.93.0、目标 stable-x86_64-pc-windows-msvc、MSVC 14.44.35207 和 SDK 10.0.26100.0 可用。探针通过 Go 本地模块缓存离线构建，`GOPROXY=off`、`GOTOOLCHAIN=local`、`CGO_ENABLED=0`。产物 SHA-256 为 `ae9a0b81d782624d9ddd1f5ef127a91c66197a125b2f1afcff23d0986efcac27`。[依赖校验](probe02/go.sum) |

## 产物、复跑与清理

在本机 PowerShell 执行以下命令，会离线重建该探针并运行四个场景。标准输出为 JSON，进程返回码为 0 表示所有断言通过。结果中的 `passed`、`coreStopped`、`tmpRemoved` 应为 true，`remainingPanes` 应为 0。

```powershell
& 'D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/probe02/replay.ps1'
```

探针源码、exe、依赖许可和两份最终 JSON 均在本报告同级的 `probe02/`。每轮均关闭测试 pane、确认该隔离 Core 已停止并删除临时配置和状态目录。结束时未发现存活的探针进程。初次编译的 `%TEMP%\huhu-t192-probe02-gocache` 仍在授权的临时目录，清理这份编译缓存的命令被自动审查拦截；最终复跑脚本的独立临时缓存已清除。业务代码、根锁和安装配置无本任务改动。

## 阻碍与接续

本机最小验证已完成。产品接入首先需要决定不配合进程内握手的 CLI 如何在启动时取得已授权的环境，再对真实 CLI 的 TUI 和输出形态验收。这不会改变上述合成 CLI 的测量结果。

## Lead 验收

由 Lead 追加。

Lead 已核对两轮隔离 Core 的成功和拒绝记录。task03 继续核对不配合握手的目标经真实进程创建环境块取值。
