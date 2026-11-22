# Agent PTY

## Linux x64

`huhu-agent-pty` 复用版本 1 的 broker、host 和一次消费回执。内层 Linux PTY 转发输入、窗口尺寸和遮蔽后的合并输出。独立监督进程持有本次启动的私有管道，外层宿主结束后杀死并回收内层进程和重新托管的后代。

```sh
bash native/agent-pty/build.sh --test
native_fixture_dir=$(mktemp -d)
(cd native/agent-pty && go build -mod=readonly -o "$native_fixture_dir/agent" ./tests/linux-fixture)
python3 native/agent-pty/tests/verify-linux.py \
  --helper native/agent-pty/bin/huhu-agent-pty --fixture "$native_fixture_dir/agent"
```

随包路径为 `resources/agent-pty/huhu-agent-pty`。目标为 Linux x64 且内核须提供 `openat2`、`faccessat2`、`pidfd` 与可执行 `memfd`。交互保护入口接受可核验的本机 x86-64 ELF。系统 sh 规则的批准绑定 `/bin/sh` 当前解析的规范 ELF 和原命令，执行持有的同一文件。内核、安装路径、文件与授权格式见 [接线协议](PROTOCOL.md#linux-x64)。

Linux PTY 使用与 Motty 相同的 [creack/pty v1.1.24](https://github.com/creack/pty/tree/v1.1.24)，许可为 [MIT](LICENSE-creack-pty.txt)。外层终端的 raw 模式由 [x/term v0.46.0](https://pkg.go.dev/golang.org/x/term@v0.46.0) 提供，随包附 [BSD-3-Clause](LICENSE-x-term.txt) 和 [PATENTS](PATENTS-x-term.txt)。Linux 内核绑定沿用 x/sys。

## Windows x64

Windows x64 上的 Console 子系统程序 `huhu-agent-pty.exe` 包含单次交付的 broker 和安装在 Core 外层终端中的 host。Engine 保有 broker 的进程及私有 stdin 和 stdout。host 校验对端后，用独立 ConPTY、经确认的工作目录和完整批准环境启动内层命令。broker 经私有通道分别报告授权已消费和内层已运行。两端的参数、JSON、状态和构建产物见 [接线协议](PROTOCOL.md)。

## 构建

在 Windows x64 PowerShell 中，从仓库根目录执行：

```powershell
& .\native\agent-pty\build.ps1 -Test
```

实际验证使用 Go 1.26.7 和本机 Go 模块缓存中的 `golang.org/x/sys v0.50.0`，以本目录的 `go.sum` 核对。脚本使用 `GOOS=windows`、`GOARCH=amd64`、`GOAMD64=v1`、`CGO_ENABLED=0`、`GOTOOLCHAIN=local` 和 `GOPROXY=off`，执行模块校验、Go 测试与 `go build -mod=readonly -trimpath -buildvcs=false`。产物为 `native/agent-pty/bin/huhu-agent-pty.exe`，保持 Windows Console 子系统默认值。产品包装可从同一文件同时启用 `broker`、`host`、`inspect` 和 `directory`。

## 复跑

```powershell
& .\native\agent-pty\verify.ps1 -Core '<fixed Herdr Core exe>' -Pi '<installed offline Pi cli.js>'
```

该探针使用已安装的 Node 24.21.0、Core 0.1.19 和 Pi 1.5.2，并校验三者的精确入口指纹。它通过现有 Huhu Core 客户端运行一次性本机 Core 服务，创建独立临时目录和 HOME。Pi 运行离线，仅使用内建的 `/session` 和 `/quit`。标准输出包含测试元数据和 JSON，结束时 `passed`、`coreStopped`、`tmpRemoved` 为 true，`remainingPanes` 为 0。可用 `-Case plain,pi` 只复跑指定场景。

## 保护范围

- Engine 只向经批准的安装映像交付，并按本次 Core 返回的根 PID 和 Win32 FILETIME 检查。命名管道为当前用户 DACL、首实例并拒绝远端客户端，两端均将 Win32 管道进程身份与活进程句柄绑定。系统管理员、可调试同用户进程和安装目录可被外部修改时的威胁，应由安装与权限策略处理。
- 目录身份用卷序号、文件索引和创建 FILETIME。目录链拒绝 reparse 和非规范路径。启动先固定路径上的实际文件，按 SHA-256 比较，保持目录和文件句柄。启动后通过进程句柄核对映像，再恢复线程。每个明确声明的脚本、解释器和附加文件均参加校验。目录内容、动态加载库、模块搜索路径及未声明依赖仍由应用批准策略负责。
- `CreateProcessW` 接收绝对 `lpApplicationName`、直接引用的 argv、批准的 cwd 和全量 UTF-16 环境。禁止句柄继承，Job 在创建期间绑定，并在宿主退出时回收整棵树。私有授权数据与环境块只用于本次启动，完成后清除可管理的字节数组。Go 与 Windows 进程内存的其他副本遵循各自的生命周期。
- 输出从内层 ConPTY 合并后过滤，才写到外层 Core。短值按字节匹配；长值从可识别前缀到尾段整段遮蔽，包括中间的并发输出和未完结的尾部。未经修改的原值及已验证的交错回显属于本次保护证据。任意切分、编码转换、主动外传和崩溃转储由应用的目标信任与输出策略负责。子进程是批准执行并可读自身环境的程序。

## 来源与许可

原生模块沿用 [Huhu 许可](../../LICENSE)。使用探针已验证的 x/sys Win32 绑定与 Windows 系统 ConPTY API。Go 标准库与运行时许可见 [Go](LICENSE-Go.txt)、[Go PATENTS](PATENTS-Go.txt)，x/sys 许可见 [x/sys](LICENSE-x-sys.txt)。本机 hcsshim ConPTY 实现用于对照句柄和属性生命周期，Core 和 Pi 由外部已安装版本供验证。
