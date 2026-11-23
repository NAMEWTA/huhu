# Linux PTY 返回 shell 测量修正

- 任务 — [task04.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8k/task04.md)
- 执行者 — `wta-ubuntu/t8k`，Lead `t3p`
- 基线 — worker `8aad86e4`，集成 `6874c619`
- 结果 — 两份探针已冻结并交回，等待 Lead 实程输出

## 结论

- t9d 报错中的 Python `master` 是 `pty.fork()` 创建的外层 PTY。host 在转发期间调用 `term.MakeRaw(in)`，并在 host 退出时恢复。内层 PTY 是另一次 `pty.Open()` 创建的，supervisor 在其 fd 0 上保存和恢复 termios。旧的 `tcgetattr(master)` 断言测错对象，不能用来判断返回 shell 的 `ICANON`。 [t9d 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/provider-pty-check.log) · [外层 raw 与内层 PTY](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/native/agent-pty/console_linux.go:53)
- t9f 的 Volta Codex、Volta Pi、直接 npm Pi 和原生 Claude 均通过真实版本输出及 `AGENT_EXIT 0` 等待，之后在返回 shell 证明处超时。Go 代码在内层恢复调用成功后才输出该标记，随后才尝试启动 shell。现有日志缺少超时时的终端输出，尚不能定位后续失败点。 [t9f 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/real-provider-check.log) · [返回阶段](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/native/agent-pty/console_linux.go:346)

## 交回的探针

- [verify-linux.py](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/native/agent-pty/tests/verify-linux.py:58) 在同一个外层 master 发送 Enter，驱动返回 shell 运行命令。命令中的 Python 查询实际继承的 fd 0，断言 `ICANON`。同一条证明检查物理 cwd、窗口尺寸、普通环境和保护变量确实未设置。证明标记由 shell 运行后拼出，输入回显无法满足断言。保留 Agent 退出 17、shell 退出 23、挂断和规则断言。
- [verify-real-provider.py](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/native/agent-pty/tests/verify-real-provider.py:50) 复用同一测量，保留 provider 版本、交互与原 host 的退出断言。两份探针在失败时输出最近 2048 字节的终端尾部。处理先剥离已识别的终端控制序列和已知合成保护值，日志中的剩余控制字符以转义形式呈现。

两个 Python 文件均通过 AST 语法检查。两套探针生成的 shell 命令均通过 `/bin/sh -n`，并静态确认发送内容没有完整证明标记。 `git diff --check` 通过。本轮实际改动为上述两个探针。Go 与 PTY 实测由 Lead 复跑。

## 来源更正

report03 的 x/sys 提交号写错。Go 模块缓存的 `v0.50.0.info` 标明 `golang.org/x/sys v0.50.0` 的来源提交为 `00227f1d192842e243cba7763c1f9a1fcb1c4344`，标签为 `refs/tags/v0.50.0`，与既有 ledger 一致。 [模块缓存元数据](/home/wta/go/pkg/mod/cache/download/golang.org/x/sys/@v/v0.50.0.info) · [Ledger](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/docs/upstream/ledger.md:67)

## Lead实程验证
候选8aad86e4→6874c619；探针935f2030→6a510e6f。t9c Go测试/构建通过，t9h定向E2E types/lint及Windows交叉编译通过；t9j五个真实PTY场景通过。t9n在独立netns、降回wta与白名单环境中，四种实际provider的version与interactive均返回原host的shell并最终退出23，4/4通过。此前bwrap探针memfd exec EACCES属测试环境，保留t9f/t9k失败日志；t9m因隔离HOME缺Corepack缓存提示被Lead结束，未执行测试。最终包/Electron未验。
