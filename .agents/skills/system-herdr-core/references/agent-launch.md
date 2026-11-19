# 启动 agent 与操作终端

## 启动前确认

读取 `hc --skill`。用 `hc run --help` 核对本机参数。按授权选择项目工作目录和目标机器。同一台机器上默认从调用位置启动；用 `--cwd` 显式指定工作目录。远程任务用 `--on` 选定机器，并传目标机器能访问的目录；省略远程工作目录时使用目标机器的 home。确保目标机器能找到所需 agent CLI。

`hc templates` 列出当前 Core 的角色模板。远程启动时，模板由目标 Core 解析，也要在目标上核对。直接启动程序时，Core 会先查找与命令同名的模板。发现同名冲突时，使用目标机器上已核对的可执行路径，例如 `/usr/local/bin/codex` 或 Windows 的 `codex.cmd` 实际绝对路径。`--` 用来分隔参数；模板解析仍按程序位置的名称进行。

## Claude Code、Codex 和 Pi

以下 PowerShell 示例从当前项目目录启动后台交互终端。每次换用当前 Core 内可用的唯一名称；POSIX shell 中也可用 `"$PWD"` 传入当前目录。

```powershell
hc run --bg --json --name claude-worker --cwd "$PWD" -- claude --dangerously-skip-permissions
hc run --bg --json --name codex-worker  --cwd "$PWD" -- codex --no-daemon --dangerously-bypass-approvals-and-sandbox
hc run --bg --json --name pi-worker     --cwd "$PWD" -- pi
```

| CLI | 用户指定模型时追加 | 用户指定推理强度时追加 |
| --- | --- | --- |
| Claude Code | `--model <模型>` | `--effort <强度>` |
| Codex | `-m <模型>` | `-c model_reasoning_effort=<强度>` |
| Pi | `--model <模型>` | `--thinking <强度>` |

模型与推理强度仅在给定时加入，按目标版本的帮助核对参数。Codex 把无法解析为 TOML 的覆盖值作为字符串，因此 `-c model_reasoning_effort=high` 可直接用于 PowerShell。用户指定的启动模式、工作目录和参数优先。Claude Code 的示例跳过权限提示，Codex 的示例关闭审批与沙箱。`--no-daemon` 使 Codex 实例使用各自的终端身份。Pi 沿用自身默认权限。

用 JSON 结果的 `address` 确定终端身份，例如 `t7` 或 `build/t7`。人可用名称识别终端。交互 agent 使用 `--bg`，保留查看、干预和继续会话的能力。从 Core 终端启动的子终端默认随父终端的程序结束；用户明确需要独立存活时才用 `--outlive-parent`。

## 首条任务与后续消息

短任务可以使用角色模板。模板是 Core 配置目录 `templates/` 下的 `<模板名>.md`。Windows 默认目录为 `%APPDATA%\herdr-core\templates`，Unix 默认是 `~/.config/herdr-core/templates`，也可受 `XDG_CONFIG_HOME` 影响。`command:` 单行填写完整程序和参数，Core 通过 `sh -c` 执行，Windows 的 Core 进程也需要能找到 `sh`。模板正文提供角色说明，命令行的剩余任务文本随后拼接成首条消息。

配置好 `reviewer` 模板后，短任务可以这样派发。示例只请求一项独立的只读检查。

```powershell
hc run --bg --json --name review --cwd "$PWD" reviewer "只审查当前分支的错误处理。按文件和行号给出发现。"
```

用 `first_message.sent` 核实首条消息是否已发。模板默认等 agent 上报 OSC 7501 状态。熟悉该 CLI 启动流程且确认可用时，模板可用 `ready: quiet` 等输出稳定。Core 0.1.21 的模板启动默认就绪等候为 60 秒；其他版本以本机手册为准。启动未完成时用 `hc get` 和 `hc read` 查原因，包括信任、认证或其他交互提示。先确认界面处于可输入状态，再发送或请用户处理需要其参与的提示。

也可在直接启动时，按具体 agent CLI 支持的语法把短任务作为位置参数，例如 `hc run --bg --json --name review --cwd "$PWD" -- claude --dangerously-skip-permissions "只审查当前分支的错误处理。"`。这种启动的任务参数由 Claude Code 解释；模板的 `first_message` 是 Core 投递结果。需要先建立任务身份的文件协作按[文件协作协议](file-coordination.md)先启动空闲 worker。

发送到现有终端前，用 `hc get` 和按需 `hc read` 确认当前状态及输入界面。若 agent 上报 `idle`，可用 `hc send --if idle` 限制投递时的状态；对没有 OSC 状态的 agent，先从界面确认已准备接收，再使用普通 `hc send`。等待一次收到的消息或超时后，先重新观察；启动空闲、无状态程序或者已结束的程序有不同的等待行为。

```powershell
hc get t7
hc read --lines 100 t7
hc send --if idle t7 "请补查异常退出路径。"
hc wait t7
hc wait --children all
hc attach t7
```

将示例中的 `t7` 换为实际地址。`hc wait --children all` 用于有子终端的调用者，收到回信或达到等待时限时也可返回。`hc send --wait` 适合单个任务；多任务先投递再等待。`hc interrupt` 请求中断当前轮，关闭终端需先确认范围和任务结果。对可能已送达的失败回执，先读终端和产物再决定是否补发。

## 后台程序

普通命令可用 `hc run <程序> <参数>` 启动并等待。需要保留终端并继续手边工作时用 `--bg`。使用返回的地址读取输出、`hc wait <地址>` 等退出，或 `hc wait <地址> --output <标志>` 等待应用发出就绪标志。用 `hc ls` 查看终端，`hc attach <地址>` 手动接管。远程结果和文件位于目标机器，按目标机器视角理解路径。
