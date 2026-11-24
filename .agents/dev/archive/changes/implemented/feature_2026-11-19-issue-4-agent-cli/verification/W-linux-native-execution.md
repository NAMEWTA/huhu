# #4/#5 Linux 原生执行验证

基线为 `22e914329e16d1cc2a7dc6338cd78cc13787eade`。在 Linux x64 上使用 Node 24.21.0、pnpm 12.10.1、临时 Vault 和 Engine 的模块凭据测试注入点。

- Codex CLI `0.170.0` 的 ELF 为 Volta 包内的 `@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex`，SHA-256 `880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971`。Volta shim 未作为受控可执行文件。
- 随桌面提供的 Herdr Core `0.1.19` 位于 `apps/desktop/resources/herdr/linux-x64/herdr-core`，解包后 SHA-256 `d408197a6b85af97b2fe93a10e6f4bee18d3a654307db94df2b35aea277c466f`。本地 `.herdr-lock` 的归档 SHA-256 `4adcfb423d52f24c5cc4a1e2cd2fcad1f62d28bb77876ac472c29082a3eaa424` 与仓库锁一致。
- Pi `1.5.2` 在独立 Core 中以 `--offline --no-session --no-tools --no-mcp --no-extensions --no-skills` 启动。`/session` 显示内存会话、零消息和零工具调用，`/quit` 退出 0。这轮验证外层 PTY 和 Pi 安装。 [本机输出](/tmp/huhu-t10-pi-live.3kEcnv/session.log)

## 平台分支与观察

| 入口 | 原保护与 Linux 结果 |
| --- | --- |
| `codex-dispatch.ts` 和独立 helper | Windows 路径要求绝对 EXE、固定版本及命名管道，原生默认模式提问还要求匹配映像指纹。Linux x64 先核对实际可执行文件的指纹和平台再运行版本探针，随后由 helper 重核指纹、文件戳和配置戳。新 socket 在 `0700` 目录下，地址通过签名的原 thread/PID 回执传递。沿用 HMAC 挑战、加签执行回执、原 Core 进程绑定和一次性启动文件。真实问答测试观察到两次回环 Responses 请求，第二次携带同一 call ID 的 Circle，应答后原 Task 只落一条最终结果。 |
| `protected-launch.ts` 和规则 helper | Windows 中继维持 ConPTY 控制台句柄以及已遮蔽的 stdout/stderr。POSIX 直接以 argv 启动现有 helper，只有批准值及基本环境白名单进入子进程，stdio 只传输入及两条输出管道，broker socket 等额外描述符不交给子进程。保留目录身份复核、一次性票据与输出遮蔽。真实 Linux Core 测到正确目录、环境诱饵缺席、公开记录无秘密、已有请求只核对原终端及票据重放退出 1。 |
| `interactive-environment.ts` 和 `native-pty.ts` | 原 Windows x64 宿主把凭据交付绑定到 Core 根进程映像及创建时间，由内层 ConPTY 处理 TTY/resize、启动确认和 Job 回收。Linux 本轮缺少带等价进程见证、文件固定及进程树回收的交互宿主，入口继续拒绝。当前沙箱无法创建非特权用户/PID namespace，cgroup 挂载为只读。现有 POSIX 规则 helper 的 stdout/stderr 为管道，覆盖规则启动。 |
| CLI/MCP 外部批准 | `plugins/automations/src/engine/terminal-environment.ts` 明确只接受已迁移的 Windows PowerShell 规则。原测试保留平台限定，新增 POSIX 回归核对批准拒绝且没有创建会话。规则 helper 的 POSIX 正向用例位于 `protected-launch.test.ts`。 |
| Core 与路径夹具 | POSIX 的 Core 0.1.19 在查空地址的 `server status` 时会启动 daemon。夹具先用专用 socket 的存在性检查缺席，Core 启动、终端操作、版本与清理使用真实 CLI/RPC。POSIX 用 sh 和目录符号链接覆盖工作目录预览、回执对账及替换，Windows 保留 PowerShell、批处理、junction 和 Win32 长 cwd 拒绝断言。 |

原生测试用回环 Responses SSE 与合成选项。其余派遣、停止和回执测试用仓库已有的合成 App Server 或行协议 provider。每轮用独立 `HOME`、外层 `CODEX_HOME`、受控 provider HOME 和 `XDG_RUNTIME_DIR`，原生夹具禁用插件同步、MCP、Web Search 与模型发现。

## 点名回归

| 文件 | 通过 | 失败 | 跳过 |
| --- | ---: | ---: | ---: |
| `plugins/agent-cli/test/codex-native.live.test.ts` | 1 | 0 | 0 |
| `plugins/agent-cli/test/dispatch.live.test.ts` | 1 | 0 | 0 |
| `plugins/agent-cli/test/launch.live.test.ts` | 1 | 0 | 0 |
| `plugins/agent-cli/test/native-receipts.live.test.ts` | 3 | 0 | 0 |
| `plugins/agent-cli/test/native-stop.live.test.ts` | 1 | 0 | 0 |
| `plugins/agent-cli/test/protected-launch.test.ts` | 3 | 0 | 0 |
| `plugins/agent-cli/test/launch-reconcile.test.ts` | 17 | 0 | 0 |
| `apps/engine/test/codex-dispatch.live.test.ts` | 1 | 0 | 0 |
| `apps/engine/test/task-dispatch.live.test.ts` | 2 | 0 | 0 |
| `apps/engine/test/agent-workspace.test.ts` | 3 | 0 | 0 |
| `apps/cli/test/approved-terminal.test.ts` | 1 | 0 | 1 |
| 合计 | 34 | 0 | 1 |

双 ACK 丢失用例恢复 `agent_received`、`tasks_consumed`，原 provider 只收到一次输入。MCP 和 CLI 交叉派遣、读取及答复后，持久收件箱记录四个 ACK，原 Native 问题和普通问题各消费一次答复。 [点名测试日志](/tmp/huhu-t10-run.FqcFTP/test.log)

复跑点名验证时，`HUHU_AGENT_LAUNCH_TEST_BIN` 取上述 Core 的绝对路径，`HUHU_CODEX_NATIVE_TEST_BIN` 取上述 Codex ELF 的绝对路径。用干净外层环境指定 Node 24.21.0 的 PATH、临时 `HOME` 和 `CODEX_HOME`，并设置 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。

```sh
pnpm exec vitest run --maxWorkers=3 \
  plugins/agent-cli/test/*.live.test.ts \
  plugins/agent-cli/test/{protected-launch,launch-reconcile}.test.ts \
  apps/engine/test/{codex-dispatch.live,task-dispatch.live,agent-workspace}.test.ts \
  apps/cli/test/approved-terminal.test.ts
```

待验平台和入口包括 macOS、Windows 回归、Linux arm64、Linux 随包安装入口以及使用本机钥匙串的交互启动。

## 全量与静态检查

| 运行 | 通过 | 失败 | 跳过 | 日志 |
| --- | ---: | ---: | ---: | --- |
| `pnpm test`，父提交的归档快照 | 1615 | 0 | 62 | [基线](/tmp/huhu-t10-run.dbZWFa/test.log) |
| `pnpm test`，候选初轮 | 1631 | 1 | 48 | [初轮](/tmp/huhu-t10-run.gRFPz5/test.log) |
| `pnpm test --maxWorkers=3`，同一候选全量复跑 | 1632 | 0 | 48 | [全量复跑](/tmp/huhu-t10-run.ZL1CC4/test.log) |

三轮都另有 Node 脚本测试 23 项通过。候选初轮失败于 SSH 转发用例 `all four modes forward real TCP, publish after acknowledgement and share one dedicated connection`，观察到状态 `failed`，预期为 `running`。同一候选单文件复跑四项通过，限制工作进程数的全量复跑也全部通过。 [SSH 复跑](/tmp/huhu-t10-run.uYJQiL/test.log)

`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 均退出 0。 [typecheck](/tmp/huhu-t10-run.yyg41C/test.log) · [lint](/tmp/huhu-t10-run.9opogg/test.log) · [format](/tmp/huhu-t10-run.9bRi00/test.log) · [knip](/tmp/huhu-t10-run.JiaQB2/test.log)
