# Windows Native PTY 接口

适用 `t17c/task11.md`，协议版本 `1`。实现与构建脚本在现有工作树的 `native/agent-pty/`。

## 启动顺序

1. Engine 从可信安装清单取得 `huhu-agent-pty.exe` 的规范绝对路径及小写 SHA-256。生成 32 个小写十六进制字符的 `runId`，直接 spawn 同一 exe，argv 为 `broker <runId>`。Engine 保留进程对象，stdin 为私有匿名管道，stdout 和 stderr 由 Engine 收集。
2. broker 建好当前用户专用的本地命名管道后，stdout 输出 `HUHU_PTY BROKER_READY 1 <brokerPid> <brokerFiletime>`。核对 PID 等于刚启动的 broker PID。不要把管道 stdin 交给 Core。
3. 向本机 `terminal.run` 提交公开 argv `[exe, "host", runId, brokerPid, brokerFiletime]`，后两项均用原十进制字符串。传公开外层 cwd，省略私有 env。核对 Core 返回的本次根终端，再直接运行同一 exe 的 `inspect <rootPid> <installedExePath> <installedExeSha256>`。成功输出 `HUHU_PTY PROCESS 1 <hostPid> <hostFiletime>`。核对 PID 等于 Core 根终端 PID；`created_ms` 不等同 Windows 进程时间。检查失败时关闭 broker 私有 stdin 并撤出本次终端。
4. 用以下 JSON 向 broker 私有 stdin 写一次 UTF-8 消息，随后关闭 stdin。broker 先核对目标文件和目录，再通过 Win32 管道客户端 PID、创建时间和安装映像复核 Host。Host 同样复核 Win32 报告的 broker 身份，随后复核实际文件。管道只发送一个长度为 4 字节大端序前缀的 JSON 帧，读到一字节 `A` 消费确认后关闭。该确认表示授权已消费。进程实际创建与退出由后续 Host/Core 状态观察。

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

- broker 成功消费确认后 stdout 输出 `HUHU_PTY ISSUED_ONCE` 并退出 0。之后同名管道关闭，Core 重启已有公开 argv 也无法重新消费。
- Host 正常收尾后输出 `HUHU_PTY CHILD_EXIT <uint32>`，进程退出码沿用内层进程。标记用于诊断，进程真实状态以 Core 或进程句柄为准。Host 结束时关闭 Job，回收仍存活的内层后代。
- 包装器固定失败状态为 `64 USAGE`、`70 FAILED`、`73 DENIED`、`74 PIN_DENIED`、`75 TIMEOUT`，诊断以 `HUHU_PTY` 开头。broker 和 host 的私有 stdin 与命名管道均使用各自启动后 30 秒的截止时间。broker 拒绝并先退出时，host 可能得到断管否认或等待超时。`ISSUED_ONCE` 不代表内层已经运行。

## 构建产物

在 Windows x64、Go `1.26.7` 与本机缓存 `golang.org/x/sys v0.50.0` 下，从工作树根执行 `& .\native\agent-pty\build.ps1 -Test`。构建产物为 `native/agent-pty/bin/huhu-agent-pty.exe`，该目录已忽略。产品资源路径和安装清单由 Lead 的装配决定；broker、host、inspect 和 directory 都调用同一份已知映像。
