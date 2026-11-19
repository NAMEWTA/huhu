# 用任务文件派发和验收

需要持久化派发、验收或交接时，从首次投递起使用文件。派发者称为 Lead，执行者称为 worker。控制消息只传 task 和 report 的路径，文件保存完整任务、产物和恢复依据。使用 [topic](../assets/topic.md)、[manifest](../assets/manifest.tsv)、[task](../assets/task.md) 和 [report](../assets/report.md)。

## 共享根和身份

- 每个主题使用项目中的 `.agents/system/herdr-core/YYYY-MM-DD-topic_name/`。使用能辨认任务的短主题名，输出主题与共享根绝对路径。同名主题先确认是恢复还是新任务，避免覆盖历史。一个主题对应一个 Lead 侧 Core 连接上下文和一套共享文件。
- Lead 在 topic 写明实际 Core 连接上下文，例如选择的会话、套接字或远程机器；使用原有标识。记录 Lead 可达的终端地址，或外部 Lead 如何收取报告。每个任务由“Lead 侧共享根绝对路径 + Lead 侧完整终端地址 + task 文件名”共同标识。
- 用 `encodeURIComponent(terminal_address)` 生成终端目录，例如 `t7` 和 `build%2Ft7`。校验目录名在实际文件系统中是合法的单一组件，拒绝 `.`、`..`、路径分隔符和宿主禁用名称。若不同真实地址在该文件系统上映射到同一目录，先处理地址冲突再派发。TSV 字段不得含 Tab 或换行。
- 同一个终端目录下按序编号 `task01.md`、`report01.md`，再用 `task02.md`、`report02.md`。编号至少两位，从未用过才能分配。代码工作目录写在 task 中，可位于其他 worktree。
- 多 worktree 使用同一共享根。远程派发先验证 Lead 与 worker 读取同一份 task，且 worker 能写入 Lead 可读的报告位置。挂载路径不同则记录各方路径，任务身份仍用 Lead 侧的共享根和完整地址。若 Lead 看到 `build/t7`，worker 进程中可能只看到 `t7`；同时核对目标机器、Core 上下文和本地 ID。

## 清单

`manifest.tsv` 的固定表头为 `terminal_address`、`task`、`status`，以真实制表符分隔。每个已派发终端一行，以 Lead 侧的原始完整地址为键；`task` 仅保存当前文件名，例如 `task01.md`。只由 Lead 写入。旧任务的判断和证据留在对应报告，空闲终端或 Lead 无需占位行。

| status | 含义 |
| --- | --- |
| `active` | 已派发，等待执行或 Lead 验收 |
| `done` | Lead 已按该任务要求验收通过 |
| `blocked` | 因明确阻碍停止推进，详细原因见报告或 topic |

worker 写入报告的 `done` 表示其认为任务完成。清单的 `done` 由 Lead 核验后写入。

## 发布与执行

1. 用[启动命令](agent-launch.md)开启空闲的交互 worker，保存 `hc run --json` 返回的 `address`。也可复用确认空闲的终端。先写完整 task，填好身份、输入、边界、工作目录、产物、验证与报告位置。确认双方可访问后发布，发布后保留原 task。
2. 确认目标已可接收输入。更新 manifest 为当前任务和 `active`，再向真实地址执行 `hc send`，将两个绝对路径作为同一条消息送出。路径带引号标清边界，调用 shell 时把整个消息作为单个参数传入。多任务先发完，再查看或等待。
3. worker 读取 task、topic、manifest，核对连接上下文、自身身份和当前指针。已在执行同一任务则接续。已存在匹配身份的终稿则回告路径。发现旧指针、身份不符、另一任务在执行或已有不匹配的报告时停止并说明；由 Lead 处理。
4. worker 按 task 写业务产物，执行并记录验证，仅修改自己的报告执行部分。完成或阻塞时，先在同目录写好临时报告，核查身份后用不覆盖已有文件的操作发布终稿。若使用 Node.js，可在支持硬链接的文件系统用 `fs.link` 从完整临时稿发布到指定路径，成功后删除临时稿；目标已存在时先读终稿。选择实际存储支持的发布方式，无法保证完整发布时交回 Lead。
5. worker 发布报告后回告其绝对路径。Core 消息带 `reach` 时，使用那里给出的 Lead 回信地址；否则用 task 中已验证的可达地址。`HC_TERMINAL_ID` 是 worker 自身身份。外部 Lead 通过 topic 指定的位置主动收取文件。回告后等待 Lead 派发下一项。若写报告失败，在终端说明任务身份、原因和已产生的结果。

Lead 侧投递示例。将地址和路径换成该任务实际值；远端挂载不同则传 worker 侧路径。

```powershell
$workerAddress = 't7'
$taskPath = 'D:\repo\.agents\system\herdr-core\2026-11-18-review\t7\task01.md'
$reportPath = 'D:\repo\.agents\system\herdr-core\2026-11-18-review\t7\report01.md'
$message = '读取 task 文件「{0}」，按其中约定执行并写入 report 文件「{1}」。' -f $taskPath, $reportPath
hc send $workerAddress $message
```

## 验收和恢复

- Lead 读取同号报告，核对完整身份、实际产物和验证证据。通过后更新 manifest 为 `done`；停止推进时根据具体阻碍标记 `blocked`。在终稿末尾追加验收意见，保留 worker 的执行部分。
- `hc send` 表示消息投递，`hc wait` 和状态表示终端当前观察。遇到发送失败、模板 `first_message.sent=false`、等待超时或被消息打断，先检查 `hc get`、`hc read`、精确的任务文件和实际产物。不能由消息返回值推断业务任务成功，也不能由无报告推断动作没有发生。
- 返工、补充、阻塞解除或更换执行者时分配新编号。更换终端时用其真实地址的目录，保持旧任务身份及证据，在新 task 引用前序任务和报告。更新 manifest 前确认旧执行者已停止或交回。
- 接手时核对 topic、manifest、当前 task、终稿和业务工作区，再根据实际状态继续。终端退出、父终端结束或重启后，复查旧动作结果；临时报告仅供恢复参考。Lead 交接可在 topic 更新负责人和接续依据，保留原验收记录。
