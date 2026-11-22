# Native PTY 接口

## Windows x64

适用 `t17c/task11.md`，协议版本 `1`。实现与构建脚本在现有工作树的 `native/agent-pty/`。

## 启动顺序

1. Engine 从可信安装清单取得 `huhu-agent-pty.exe` 的规范绝对路径及小写 SHA-256。生成 32 个小写十六进制字符的 `runId`，直接 spawn 同一 exe，argv 为 `broker <runId>`。Engine 保留进程对象，stdin 为私有匿名管道，stdout 和 stderr 由 Engine 收集。
2. broker 建好当前用户专用的本地命名管道后，stdout 输出 `HUHU_PTY BROKER_READY 1 <brokerPid> <brokerFiletime>`。核对 PID 等于刚启动的 broker PID。不要把管道 stdin 交给 Core。
3. 向本机 `terminal.run` 提交公开 argv `[exe, "host", runId, brokerPid, brokerFiletime]`，后两项均用原十进制字符串。传公开外层 cwd，省略私有 env。核对 Core 返回的本次根终端，再直接运行同一 exe 的 `inspect <rootPid> <installedExePath> <installedExeSha256>`。成功输出 `HUHU_PTY PROCESS 1 <hostPid> <hostFiletime>`。核对 PID 等于 Core 根终端 PID；`created_ms` 不等同 Windows 进程时间。检查失败时关闭 broker 私有 stdin 并撤出本次终端。
4. 用以下 JSON 向 broker 私有 stdin 写一次 UTF-8 消息，随后关闭 stdin。broker 先核对目标文件和目录，再通过 Win32 管道客户端 PID、创建时间和安装映像复核 Host。Host 同样复核 Win32 报告的 broker 身份，随后复核实际文件。broker 只发送一个带 4 字节大端序长度的 JSON 授权帧。
5. Host 验收授权后经同一私有管道发送 `A`。broker 先在 Engine 私有 stdout 上写 `HUHU_PTY ISSUED_ONCE`，再回送 `A`，Host 才能启动。管道保持开启以收取一个两字节的启动回执。Host 在 `CreateProcessW` 建立已进入 Job 的内层进程、核对实际映像且 `ResumeThread` 成功解除挂起后发送 `R\x00`。启动失败则发送 `F` 加一字节脱敏状态码。

## 私有提交 JSON

```json
{
  "version": 1,
  "host": {
    "pid": 12345,
    "created": "134396800000000000",
    "image": {"path": "<installed exe absolute path>", "sha256": "<64 lowercase hex>"}
  },
  "launch": {
    "directory": {"path": "<approved absolute cwd>", "id": {"volume": "<decimal>", "index": "<decimal>", "created": "<decimal>"}},
    "image": {"path": "<approved target exe absolute path>", "sha256": "<64 lowercase hex>"},
    "entry": {"path": "<approved interpreted entry absolute path>", "sha256": "<64 lowercase hex>"},
    "files": [],
    "argv": ["<same target exe path>", "<same entry path>", "<approved argument>"],
    "environment": {"SystemRoot": "<actual Windows root>", "SYNTHETIC_TOKEN": "<one-time value>"},
    "protect": ["SYNTHETIC_TOKEN"]
  }
}
```

- 在用户批准 cwd 时调用 `directory <absolutePath>`。成功输出 `HUHU_PTY DIRECTORY 1 <volume> <index> <created>`，三项按十进制原文作为字符串保存。`created` 及 broker/host 进程时间均为 Windows FILETIME 原始 64 位数值，不转换成 JS `number`。它由 Win32 高 32 位与低 32 位组成。PID 是 uint32。
- `entry` 可省略。使用解释器时 Engine 必须明确批准解释器 `.exe` 和入口文件，提供 `entry` 并使其等于 `argv[1]`。`argv[0]` 必须等于 `image.path`。`files` 是额外批准的实际依赖文件及 SHA-256，最多 128 项。路径须为本机固定卷规范绝对路径，保留文件系统实际大小写，目录链拒绝 reparse，文件按 SHA-256 并持句柄固定。解释器及其他动态依赖的许可范围仍由 Engine 的批准策略决定。
- 整份 JSON 最多 1 MiB，字段须符合版本。`environment` 是完整批准环境，最多 256 项，按 Windows 不区分名称大小写，重复名称会拒绝。`protect` 是其中最多 32 个变量名。受遮蔽值必须非空，UTF-8 最多 4096 字节且无控制字符。批准的 cwd 和 argv 中出现受遮蔽原值会拒绝。

## 终态

- `HUHU_PTY ISSUED_ONCE` 是不可回退的消费事实。Engine 从自己启动并保有的 broker 私有 stdout 读取回执，并保留消费事实，即使后续启动失败、断线或超时。
- `HUHU_PTY RUNNING` 单独报告内层已经解除挂起，由可信 broker 收到 `R\x00` 后写到私有 stdout，随后 broker 退出 0。Engine 以该记录确认首次运行。公开 Core 终端文本和 broker 退出码均不充当启动成功回执。
- 明确的启动失败由 broker 输出 `HUHU_PTY START_FAILED 70`（启动失败）或 `HUHU_PTY START_FAILED 74`（实际映像核验失败），以同一状态退出。已消费后遇到断管、超时或无效回执，broker 输出 `HUHU_PTY START_UNKNOWN`（仍能写私有 stdout 时）。状态中不带异常详情、路径、argv 或环境。即使 broker 已退出，恢复成功的内层仍会继续运行。
- Engine 对回执缺失、连接失效或状态未知沿用原 `requestId` 核对，保留已知消费事实，禁止根据缺少 `RUNNING` 自动重新交付或新建终端。管道关闭后，同一公开 argv 也无法再次消费。
- Host 正常收尾后输出 `HUHU_PTY CHILD_EXIT <uint32>`，进程退出码沿用内层进程。公开标记用于诊断；后续问题按 Core 终端和进程状态核对。Host 结束时关闭 Job，回收仍存活的内层后代。
- 包装器固定失败状态为 `64 USAGE`、`70 FAILED`、`73 DENIED`、`74 PIN_DENIED`、`75 TIMEOUT`。私有 stdin 与命名管道使用 broker 和 host 各自启动后 30 秒的截止时间。

## 构建产物

在 Windows x64、Go `1.26.7` 与本机缓存 `golang.org/x/sys v0.50.0` 下，从工作树根执行 `& .\native\agent-pty\build.ps1 -Test`。构建产物为 `native/agent-pty/bin/huhu-agent-pty.exe`，该目录已忽略。产品资源路径和安装清单由 Lead 的装配决定；broker、host、inspect 和 directory 都调用同一份已知映像。

## Linux x64

- `broker` 和 `host` 延用相同 argv 形状。`created` 改为 `/proc/<pid>/stat` 第 22 字段的启动 tick，保持十进制字符串。`inspect <rootPid> <helperPath> <helperSha256> <runId> <brokerPid> <brokerCreated>` 检查 Core 根 PID 的 pidfd、实际映像与对应 host argv。两端使用抽象 Unix socket 的内核对端凭据核对 UID 与 PID，并复查进程实例。
- `program <path> <sha256>` 输出 `HUHU_PTY PROGRAM 1 <device> <inode> <ctime_ns>`。Linux 消息里的 `image.id` 用这三个十进制字段。`directory` 输出设备、inode 和出生时间，缺少出生时间的文件系统使用 ctime。Engine 和 host 复核目标路径在核对时的身份，host 持有打开的目录描述符到内层启动。
- Linux ELF 交互程序以批准摘要校验的密封 memfd 启动。外部批准的系统 sh 使用 `launch.approvedShell` 的规范绝对路径、`dev:ino`、出生时间、ctime、mtime、大小和 SHA-256，且 argv 形状为 `[path, "-c", command]`。核对通过后通过已打开的原文件描述符执行。
- 私有帧、`ISSUED_ONCE`、`RUNNING` 和未知状态沿用版本 1。Linux env 名区分大小写。Linux 拒绝 `LD_*` 和 `GLIBC_TUNABLES`。受保护值与内层输出使用同一流式遮蔽。Linux 信号退出状态为 `128 + signal`，监督进程在内层退出或外层管道关闭后回收已重新托管的后代。
