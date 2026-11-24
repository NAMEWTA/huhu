# Windows 内层 ConPTY 子进程的创建环境

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t192`，与本机 `HC_TERMINAL_ID` 一致
- task — `task03.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/task03.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/report03.md`
- 执行结果 — **done（独立本机探针）**

## 结论

**已证明受信宿主可以在创建内层进程时交付选定环境。** 在固定 Herdr Core 0.1.19 与 Windows x64 上，独立 Node 测试程序的第一条业务语句直接读取 `process.env`。程序确认读到的合成值与预期 SHA-256 完全匹配，中文与非 BMP 字符保真，环境名称集合恰好等于白名单。它没有 Huhu 依赖、没有参与命名管道握手，也没有给自身设置环境。省略该变量后，同一入口报告缺失。[子程序入口](probe03/entry.cjs) · [宿主实现](probe03/main_windows.go)

**真实 Pi 1.5.2 也通过这条创建路径完成了交互。** 在全新 HOME 和离线模式下，从外层 attach 输入内建命令 `/session`，收到 Pi 生成的 `Session Info` 面板；随后输入 `/quit`，内层 Pi 和外层宿主均以 0 退出。尺寸另由合成 CLI 实测，从初始 `120 × 32` 调整到 `94 × 27`。未向 Pi 提交模型提示，未调用 provider，未读取用户 CLI 配置。首轮证据（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/task03/legacy-7984bff4/probe03/result.json`） · 独立复跑（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/task03/legacy-7984bff4/probe03/repeat.json`）

## 两轮验证结果

两轮均使用新 Core 实例、随机合成值和独立目录；每轮六个场景。

| 场景 | 观测结果 |
| --- | --- |
| 正常交付 | 入口返回 `exact=true`、`unicode=true`、`keys=true`、`decoyAbsent=true`、`tty=true`。输入 `ping` 后收到 `CLI_PONG`。Core 确认外层尺寸已变更，子进程从控制台重新读取并返回 `94 × 27`。子进程退出 0 |
| 交错回显 | 仅此场景要求子程序故意将标记分两段写至 stderr，中间由 stdout 写入一条公开事件。宿主在输出进入 Core 前遮蔽该区间。外层原始 attach 与屏幕均有 `[REDACTED]`，未出现完整标记、随机部分的任一半段或任一连续 8 位。两轮记录的遮蔽计数均为 2；计数对应终端字节流中识别到的前缀次数，命名管道仍只交付一次 |
| 省略变量 | 同一目标返回 `missing=true`、`exact=false`，父环境诱饵仍缺席。子进程按约定退出 17，宿主核实负对照后退出 0 |
| 宿主身份不匹配 | 将预期进程创建时间增加一个 FILETIME 单位。签发进程拒绝交付，外层退出 23，没有内层子进程结果 |
| 目标文件被替换 | 在独立临时目录复制探针宿主，放入同名但 SHA-256 不匹配的无害脚本。宿主在领取前返回 `TARGET_PIN_DENIED` 并退出 24，没有执行替换脚本。该场景未创建签发进程，也未生成合成值 |
| 离线 Pi | 固定 Node 映像与 Pi 入口，启用 `--offline --no-session`，禁用扩展、MCP、技能、项目上下文及遥测。测试只发送两个本地内建命令；依据应用返回的面板内容和实际子进程退出码判定通过 |

## 交付与过滤边界

1. **先核对接收方。** 宿主打开预批准的 Node 映像与选定入口脚本，验证 SHA-256 并持有只允许共享读取的文件句柄。签发进程按 Core 返回的宿主 PID、Windows 创建时间和映像身份验证命名管道对端；宿主也验证服务端。成功领取后，同名管道的第二次打开被拒绝。目标脚本和 Pi 仅通过 Windows 创建环境取值。[宿主与签发进程](probe03/main_windows.go)
2. **显式构造子进程环境。** 固定的基础项包括 SystemRoot、WinDir、ComSpec、系统目录 PATH、临时目录和空用户目录。保护值只占一个选定变量；专用于合成 CLI 的预期摘要未交给 Pi。Pi 仅另加离线、遥测关闭和临时配置目录三项。宿主按变量名排序，将 `NAME=value` 编码为双 NUL 终止的 UTF-16 环境块，通过 `CreateProcessW` 的 `lpEnvironment` 与 `CREATE_UNICODE_ENVIRONMENT` 提交，随后清除构造缓冲。创建时禁用句柄继承，子进程加入 Job 并复核实际映像后才恢复执行。Windows 在创建调用期间复制环境；子进程 PID 是创建后才得到的。这一步依赖创建前固定目标和已核验的宿主权限。[环境块与创建调用](probe03/main_windows.go)
3. **保留过滤失败的证据边界。** 前期对照发现，原先的整串匹配在 stdout 插入两段 stderr 之间时，公开输出可出现合成值的一半。最终探针对具有已知格式的合成标记从前缀开始抑制输出，直到识别其随机尾部及 Unicode 后缀，期间插入的公开事件一并舍弃。该对照仍保留在最终夹具中。这里验证了这个格式和交错方式；任意真实凭据、变形输出、崩溃转储及恶意目标的保密性仍不在证明范围内。[交错写入夹具](probe03/entry.cjs) · [过滤检查](probe03/run.cjs)
4. **分别核对内外部观察面。** 驱动逐项比较公开 Core argv 与实际提交，读取私有快照确认 restart_env 为空或省略。宿主也断言实际内层 argv 不含合成值。每个有签发进程的场景检查原始 attach、屏幕、Core 视图、签发诊断和运行目录内当时可读的文件；文件同时扫描 UTF-8 与 UTF-16LE。独占的 `core.lock` 在停服后补扫。两轮均未检出完整合成值。Pi 的成功依据是离线 TUI 的响应与退出；环境值的逐字节校验依据是独立子程序的入口断言。[驱动与断言](probe03/run.cjs)

## 产物、版本与复跑

| 项目 | 实测版本或 SHA-256 |
| --- | --- |
| 运行环境 | Windows x64 `10.0.26300`、Go `1.26.7`、Node `v24.21.0`。两份最终 JSON 均记录 integration `c3d5b7ffe298cf093f11b1551969c4694b71d560` 及实际加载的 Huhu 源文件哈希 |
| Core 0.1.19 | `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d` |
| 预批准 Node 映像 | `ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32` |
| Pi 1.5.2 入口 | `e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774`；运行本机 MIT 发行版，未复制其配置或程序 |
| 独立宿主 / 子程序脚本 | `ac202635dc0e171be085a259f88fabfc95bc1fb0b33cbdac1b18d4d283bdcde4` / `11bce83f2e4c8ec0e5cf07d385bc456d710412228fb9d8f1a726518cee41a126` |

Go、x/sys、hcsshim、ORCA、Huhu 和固定 Core 的来源、提交、许可与使用范围沿用 task02。探针实际链接本机缓存的 `golang.org/x/sys v0.50.0`，离线构建未改项目依赖或安装配置。[来源记录](report02.md) · [Go 许可](probe02/LICENSE-Go.txt) · [x/sys 许可](probe02/LICENSE-x-sys.txt)

在本机 PowerShell 执行以下命令可重建探针并复跑。标准输出是 JSON，成功时 `passed=true`、`remainingPanes=0`、`coreStopped=true`、`tmpRemoved=true`。

```powershell
& 'D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t192/probe03/replay.ps1'
```

## 阻碍与清理

本次独立验证已完成。测试 pane 均已删除，各轮 Core 都已停服，临时 HOME、Pi 配置、运行状态、替换目标目录和构建缓存均已清理。产物只在 `probe03/` 和本报告中；未写业务代码、未新增 worktree、未执行远程写入或 integration 构建。生产安装包的授权持久化、重启对账和通用 TUI 过滤仍由产品集成验收。

## Lead 验收

由 Lead 追加。

Lead 复核实际 Node 创建环境及离线 Pi。应用原生宿主由 t17c task11 实施，桌面装配由 Lead 接续。
