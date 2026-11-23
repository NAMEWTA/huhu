# Linux Agent 启动环境与已批准 sh

- Core `wta-ubuntu`，Lead `t3p`，worker `t86`。任务 [task01.md](task01.md)，接线 [integration-notes.md](integration-notes.md)。实施和定向验证已交 Lead。实际 CLI/MCP 对账遇到阻塞，诊断见下文。
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/integration`，分支 `impl/huhu-issues-3-10-integration`。业务改动留在共享工作树。Lead 持有 Engine 注册、桌面打包与上游许可装配。

## 实现

- **普通 Agent 配置。** 先从已有离线凭据视图按配置 ID、版本及 provider 读取普通值，合并 resolver 的环境层，并在连接 Core 后复核版本。保留空字符串、工作目录、独立 argv 参数和 Core 默认 shell。预览只显示变量名，发送用现有 `terminal.run`，同 requestId 重查原会话。选择普通配置时，即使受保护 helper 或系统保护缺席，桌面仍能预览和确认。
- **Linux 受保护 Agent 配置。** 沿用 Windows v1 的 Engine 私有 stdin、启动回执和 Core attach。Linux 以 pidfd、进程启动 tick、实际映像、runId argv 与 Unix socket 对端凭据核对原 Core 根 PID。经过摘要和 inode/ctime 核验的 ELF 以密封副本执行，目录用已打开的文件描述符绑定。真实内层 PTY 转发输入、尺寸与已遮蔽的合并输出。监督进程持有外层宿主的私有管道，内层退出或外层宿主消失后回收原进程和重新托管的后代。Engine 分别保留已消费、已启动和结果待核实，重查沿用原 requestId。
- **外部已批准 sh。** 新增私有 `SessionsService.launchApprovedShell(input, signal?) → Promise<SessionRecord>`。入参沿用 `TerminalRuleLaunch`，附 `env`、`approvedDirectory` 与 `approvedShell`；运行时只接受 `provider: "shell"`、`shell: "sh"` 及 `[executable.path, "-c", command]`。实际 helper 核验系统 `/bin/sh` 的规范 ELF、文件系统身份、出生时间、ctime、mtime、大小、权限和 SHA-256，并通过同一个打开的文件执行。保护值走一次性票据，Core 收到公开宿主 argv 和目录。规则会话保留既有脱敏输出和结束后清理合同。Lead 的 `agentProtectedTerminal.launchApprovedShell` 注册返回 `{ id: session.id }`，沿用 `waiting.poke()`，无需公开 contracts 改动。
- **构建与支持范围。** `bash native/agent-pty/build.sh [--test]` 输出 `native/agent-pty/bin/huhu-agent-pty`，随包路径为 `resources/agent-pty/huhu-agent-pty`。Windows 继续使用 `.exe`、原编译脚本和 ConPTY。Linux 保护路径支持 x64，并要求内核提供 `openat2`、`faccessat2`、pidfd 和可执行 memfd，约为 Linux 5.8 及以上。Agent 保护入口支持可核验的 x86-64 ELF，包含识别出的 Codex npm 本机映像。脚本、JavaScript 解释器、版本管理 shim 以及依赖原始 ELF 路径查找资源的程序仍需各自的兼容验收。普通配置沿用 resolver 的现有入口范围。

## 复用与依赖

- Huhu 复用当前 Windows 原生协议、流式遮蔽、会话回执和 Core attach。居于同一可信包的 Linux helper 负责系统调用边界；普通环境继续走现有 resolver。
- 核对 `temp/sources/herdr-core` 的外层 Linux PTY 和 `temp/sources/motty` 的 Go PTY 使用。沿用 Motty 的 creack/pty v1.1.24（MIT）分配内层 PTY，使用 golang.org/x/term v0.46.0（BSD-3-Clause 与 PATENTS）管理 raw 模式，沿用 golang.org/x/sys v0.50.0。版本固定于 native 模块，许可随 helper 包装。相关来源与命令记录在原生 README 和协议。 [creack/pty](https://github.com/creack/pty/tree/v1.1.24) · [x/term](https://pkg.go.dev/golang.org/x/term@v0.46.0) · [原生模块说明](../../../../../temp/issue-worktrees/integration/native/agent-pty/README.md)

## 已验证

| 执行方 | 检查及结果 |
| --- | --- |
| Worker | `git diff --check`、`bash -n native/agent-pty/build.sh`、Python 夹具语法和定向格式检查通过。 |
| Worker | `sessions.test.ts` 两次均为 29 通过、2 失败。两条新增普通环境用例通过。两条已有 Core 用例受沙箱 UNIX socket `EPERM` 影响，换独立 `XDG_RUNTIME_DIR` 后仍复现，未为沙箱修改产品。 |
| Lead t8j | Node 24.21.0、独立 `XDG_RUNTIME_DIR` 下同一文件 31/31 通过，包含真实 Core 用例。 [linux-session-check.log](../../../../../temp/issue-evidence/huhu-2026-11-22/linux-session-check.log) |
| Lead t8m | `bash native/agent-pty/build.sh --test` 完成 Go 测试并生成 Linux amd64 helper（Go 1.27.1）。 [linux-pty-build.log](../../../../../temp/issue-evidence/huhu-2026-11-22/linux-pty-build.log) |
| Lead t8n | 真实 PTY 夹具的 `normal`、`host-crash`、`changed-file` 均通过。核对三路 TTY、split 回显遮蔽、键盘与 resize、退出码、宿主崩溃时的后代回收、一次消费和同字节换 inode 后拒绝。 [linux-pty-live.log](../../../../../temp/issue-evidence/huhu-2026-11-22/linux-pty-live.log) |
| Lead t8v | 修正 `protocol_windows.go` 迁移后遗留的 `regexp` import，Windows 交叉编译复查通过。 |
| Lead t8q | Agent 定向 tsc 及六份 E2E 和候选包 helper 的临时 tsc 均退出 0。前次 tsc 发现 `inspectHost` 的局部变量遮蔽 Node `process`，已改名后通过复查。 [linux-agent-recheck.log](../../../../../temp/issue-evidence/huhu-2026-11-22/linux-agent-recheck.log) |

## 未运行的验证

- 本轮 worker 未运行 Go 编译、Electron / Playwright、全仓类型检查、全量套件、打包、安装或视觉取证。Lead 已完成上表的定向测试，实际桌面和安装包验收、Windows ConPTY 回归仍需实跑。
- `tests/e2e/agents/linux-environment.spec.ts` 包含「Linux 普通 Agent 环境可编辑并在保护服务缺席时进入真实 Core」与「Linux 受保护 Agent 在 Safe 三态使用真实 PTY、键盘和 resize，并回收后代」。后者亦检查重新 attach、原值不出现在输出、批准后换映像拒绝。受保护用例须在隔离 Secret Service 下执行。实际 Codex/Pi 安装入口、丢回包后经桌面恢复与 Engine/Core 重启属于剩余验收，当前实际 PTY 证据来自离线 ELF 夹具。
- 已批准 Linux sh 的桌面组合用例 `tests/e2e/workflows/automation-linux-environment.spec.ts` 待实跑。Go 用例已核对已打开系统 sh 的元数据及错误 mtime 拒绝，单独的真实 PTY 夹具使用 Agent 测试 ELF。已执行的 CLI/MCP 真实 Core 用例结果见下文。
- Windows 在 Windows x64 对同次提交运行 `& .\native\agent-pty\build.ps1 -Test` 与 `verify.ps1`，并跑 `tests/e2e/shell.spec.ts` 的「Agent 受保护启动在 Safe 未初始化、锁定和停用时接入真实终端」。

Lead 串行复跑的 Linux 原生和 E2E 命令。Playwright 在隔离显示、HOME 和 D-Bus 会话里执行，固定候选包模式另提供候选包摘要与 Git SHA。

```sh
bash native/agent-pty/build.sh --test
native_fixture_dir=$(mktemp -d)
(cd native/agent-pty && go build -mod=readonly -o "$native_fixture_dir/agent" ./tests/linux-fixture)
python3 native/agent-pty/tests/verify-linux.py \
  --helper native/agent-pty/bin/huhu-agent-pty --fixture "$native_fixture_dir/agent"

HUHU_AGENT_LINUX_PROBE="$native_fixture_dir/agent" \
  xvfb-run -a pnpm exec playwright test tests/e2e/agents/linux-environment.spec.ts --workers=1
HUHU_AGENT_LAUNCH_TEST_BIN=/absolute/path/herdr-core \
  pnpm exec vitest run apps/cli/test/approved-terminal.test.ts
xvfb-run -a pnpm exec playwright test tests/e2e/workflows/automation-linux-environment.spec.ts --workers=1
```

## Modern Web Guidance

- **`forms`** 我用 `aria-describedby` 把所选配置的可用性提示关联到原来的 select，让读屏在禁用预览时能读到原因（“use `aria-describedby` to link inputs with help text or error messages”）。
- **`accessibility`** 我保留原生选择和按钮，给状态文字单独的可访问描述，避免把错误原因塞进选项名（“Instead, use the `aria-describedby` attribute to programmatically associate any additional content with the field.”）。

## CLI/MCP 真实 Core 对账阻塞

Lead t8r 的 `approved-terminal.test.ts` 为 1 通过、1 失败。失败在第 183 行，故障解除后原 `runId` 和 `activationId` 一致，状态在 12 秒内一直是 `unknown`。同一意图始终只有一次成功返回到故障注入层的真实 `terminal.run`。 [linux-approved-live.log](../../../../../temp/issue-evidence/huhu-2026-11-22/linux-approved-live.log)

1. 夹具等待真实 `terminal.run` 返回才丢弃其结果，随后使 `terminal.list` 暂时失败。此时可确认的是 Core 创建了原外层 host 的终端记录。夹具的 `starts` 计数来自这个 RPC，未观察内层 sh。 [故障注入与断言](../../../../../temp/issue-worktrees/integration/apps/cli/test/approved-terminal.test.ts#L48)
2. `launchNative` 已持久化 `nativeStatus: pending`。失去启动回包和列表快照时，它在 `native_host_unverified` 分支抛错，随后在 `finally` 撤销原 broker。该分支位于 `inspectHost`、`native.use` 和 `broker.start` 之前。依据这条代码路径，此次仅提交了外层宿主，保护票据未交付，内层 sh 无法执行。宿主因原 broker 关闭退出也只能证明外层结束。 [第 691–746 行](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L691)
3. 相同意图返回 Automations 原运行回执。后台对账按原 requestId 查 Agent 会话，Agent 的 `applySnapshot` 要求已有私有 `started` 状态，才允许绑定 Core 终端作为内层会话。因此 Core 恢复后，即使出现同一个已结束外层记录，也无法将它结算为成功。这个约束应保留。 [Agent 状态门槛](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L851) · [Automations 对账](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L789)

**推荐修复。** 将「原 broker 等待核验」「已授权一次」「确认内层已启动」保留为不同阶段。首个调用可返回原请求 `unknown`，由现有 Vault 生命周期内的启动协调器在原 broker 的有限窗口继续核对。找到同一 Core 上唯一匹配原尝试标签、argv/cwd、地址及进程实例的活 host 后，重新检查当前授权与原版本，再通过原 broker 私有 stdin 交付一次。等待期间保留非秘密的计划和凭据引用，领取值仍在核验完成后发生。在待核实窗口内保持取消与 Vault 关闭有效。过期、换实例、授权撤回或版本变化后停止交付；已消费但没有私有启动回执的历史仍待核实。外层退出码和公开终端文字均不作为内层启动或成功证据。

**需要独立决定的边界。** Automations 当前从 `ModuleCredentials.use` 内发起启动，回调结束后凭据 Map 被清空，启动未完成时也会移除运行取消控制器。要允许首个 RPC 已返回后的授权，需要共同确定原 grant/主体/配置版本在何处重新授权、原 run 的取消控制器如何在等待期间保持，以及 broker 在撤权、超时或 Engine/Core 退出时由谁清理。跨 Engine 重启继续交付与已消费后的可信启动回执恢复是两个更强的合同，需要单独确认是否引入可信持久凭据或持久回执。不能把延长定时器、仅增加一次前台列举，或在重试时新建 broker/终端当作对账修复。夹具在第一次 `unknown` 之后才解除故障，前台阻塞直到超时也无法通过该场景。 [凭据 lease](../../../../../temp/issue-worktrees/integration/packages/kernel/src/credentials/module-credentials.ts#L413) · [原 run 生命周期](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L533)

**下一条验证。** 保留既有失败断言，增加内层实际启动一次的独立观测。覆盖撤权、取消、错误 host、过期、已消费失回执和重复请求。现有规则断言还要求遮蔽标记 `***`，原生流使用 `[REDACTED]`，这次测试在更早的对账断言已经停止。组合复跑时需保留规则输出标记合同，例如在规则的受验证输出通路映射原生遮蔽标记，避免为格式重新领取保护值。 [规则输出断言](../../../../../temp/issue-worktrees/integration/apps/cli/test/approved-terminal.test.ts#L183)

本次只补对账诊断和 Windows 无用 import，未修改启动恢复逻辑或测试断言。独立分析由 Lead 的 t8t 执行，恢复修复留待 task02。

## Lead 验收

由 Lead 追加。

### Lead 收取（2026-11-22）
已保存原生候选；Linux Go 测试/真实 PTY 三组、sessions 31 项、Agent 和 E2E 定向类型检查均通过。Windows 交叉编译先因未使用 regexp import 失败，修正后 t8v 退出 0（非 Windows 运行验收）。实际 CLI/MCP/Core t8r 在回包丢失恢复场景失败，run 保持 unknown；linux-approved-live.log 保留。此候选未验收，t8t/task01.md 正独立分析，后续实施需新编号。

原生候选保存为 d0f50bbb；Task01 实施与定向验证已收取，功能验收继续于 task02。
