# Linux 显式 sh 终端规则外部批准

- 任务 `t4x/task13.md`，Core `wta-ubuntu`，执行 `t4x`，Lead `t3p`。分支 `impl/huhu-issues-3-10-desktop-web-verify`，基线 `41f3c8e404bd9d9aec83c4be99ff2b97335530e7`。
- Automations 的批准与派遣侧、桌面界面、领域用例和真实入口 spec 已写入工作树。Linux 正向实程依赖下文的 Agent 私有接线。改动未暂存、提交或推送。

## 实现

- Linux 外部批准目标限定为显式 `sh`。核对把 `/bin/sh` 解析为本机规范路径，固定 `[规范文件路径, "-c", 原命令]`。对打开的文件核对 ELF、设备与 inode、出生时间、修改时间、元数据时间、大小和 SHA-256，拒绝可由非 root 应用用户、其他组成员或其他用户改写的文件及脚本包装器。本机核对到 `/usr/bin/dash`。批准摘要包含本机 Vault 实例、规则版本和文件身份、原命令、Space/目录及 revision 和上述映像与 argv。变量名以原有批准记录及 namesRevision 绑定。Windows PowerShell 继续使用原摘要、批准和启动接口。 [系统 shell 核对](../../../../../temp/issue-worktrees/agent-linux/plugins/automations/src/engine/approved-linux-shell.ts) · [批准与凭据 lease](../../../../../temp/issue-worktrees/agent-linux/plugins/automations/src/engine/terminal-environment.ts)
- Linux 与 Windows 都沿用逐项开放、配置版本、批准复核、受保护值 lease、运行回执及 `approvedDirectory`。Linux 外部派遣只调用专用私有方法。该方法缺失时预检显示原因，提交批准和外部调用被拒绝。普通无保护值的本地 `default` 和显式 `sh` 仍走原路径，未对其他 shell 开放外部批准。
- 桌面批准对话框显示实际 sh 命令与解释器路径。保留 Windows 的「PowerShell 命令」预览。Modern Web Guidance 的 `forms` 指南用于通过 `aria-describedby` 将不可批准原因关联到提交按钮。 [批准对话框](../../../../../temp/issue-worktrees/agent-linux/plugins/automations/src/ui/TerminalApproval.tsx)

## Lead 接线

Agent 引擎、桌面/Engine 注册及公共 contracts 在本轮为只读。现有 `agentProtectedTerminal.launch` 会在 SessionsService 重新把 `sh` 转为裸命令名，无法兑现已批准文件的身份。请在该私有服务增加如下方法并接入一次性保护票据。生产环境在完成前保持拒绝。

```ts
launchApprovedShell(
  request: TerminalRuleLaunch & {
    env: Record<string, string>;
    approvedDirectory: { path: string; identity: string; birthtimeNs: string };
    approvedShell: {
      executable: {
        path: string;
        identity: string;
        birthtimeNs: string;
        ctimeNs: string;
        mtimeNs: string;
        size: string;
        sha256: string;
      };
      argv: [executable: string, flag: "-c", command: string];
    };
  },
  signal: AbortSignal,
): Promise<{ id: string }>;
```

- 入参沿用原 `TerminalRuleLaunch` 的 `spaceId`、`spaceRevision`、`provider: "shell"`、`command`、`shell: "sh"`、`requestId`。校验 Linux、路径为绝对规范路径、argv 长度与三个参数一致。将映像摘要和 argv 加入内部 launch 意图绑定，在领取凭据的实际 helper 里复核目录。
- helper 在执行前打开已批准的映像文件，核对文件身份、时间、大小与哈希，持同一打开文件执行以避免文件换名窗口。按受支持宿主提供的执行机制完成，失配、无法验证或不支持时拒绝。保持原 session/request 对账、票据仅消费一次和输出脱敏。Core 的 argv、环境和恢复数据只携带已有的票据调用信息。Windows 和普通本地 launch 保持原路径。无需新增公开 capability。

## 实际验证

Node `v26.11.1`。只运行这个 Vitest 文件，最终 **34 项通过**，并通过 `git diff --check`。

```sh
pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/automations/test/service.test.ts --maxWorkers=1
```

- 新用例使用临时 Vault、TestProtection、真实批准/开放与运行记录，Agent 启动方法为替身。覆盖缺少专用启动、初始关闭、无批准、环境保护值保存、拒绝修改 PATH、待批准命令的 PATH 无关性、规则和 Space 变化、旧版本、撤权、双请求同运行及一次启动调用。核对替身收到的是规范映像、固定 argv、目录和 lease 内合成值，旧启动方法零调用，运行记录无合成值。另验普通 `default` 和 `sh` 仍可工作。
- 第一次执行因系统文件在沙箱映射为 UID 65534 被只允许 root UID 的初版条件拒绝，结果 33 通过、1 失败。条件改为检查文件能否被应用用户、组或其他用户改写后复跑通过。实际 Linux 文件替换、同一文件执行及 Core 物理启动次数留待下轮。
- 本轮未运行 CLI 集成文件、Playwright E2E、Go 构建、全仓检查或打包。保留 `scheduler.test.ts` 和所有既有 workflow spec。未写 Agent、公共 contracts 或 Engine/desktop 注册。

## Lead 验收轮

- 装好私有 Agent 接线后，用真实 Core 运行 `apps/cli/test/approved-terminal.test.ts`。Linux 分支使用 TestProtection，复用真实 CLI、HTTP MCP/stdio、工具开放与撤回、配置轮换、重复意图、丢失 Core 回包、重开和归档隔离断言。该用例也保留 Windows 的对应分支。使用项目构建好的 CLI bundle 时可设置 `HUHU_CLI_TEST_BUNDLE`。 [CLI/MCP/Core 夹具](../../../../../temp/issue-worktrees/agent-linux/apps/cli/test/approved-terminal.test.ts)

```sh
HUHU_AGENT_LAUNCH_TEST_BIN=/absolute/path/herdr-core flock /tmp/huhu-heavy.lock pnpm exec vitest run apps/cli/test/approved-terminal.test.ts --maxWorkers=1
```

- Linux 桌面验收用已准备的 Electron、CLI bundle、Core 与隔离的 Secret Service。验证实点批准，经 CLI 保存并运行、MCP 轮换并运行，核对输出遮蔽、两个稳定运行 ID、撤销后拒绝及启动文件恰好两行。验收时另用受控替代映像/目录夹具检查 Agent helper 最终拒绝以及同一路径换名时仍只执行已验证文件。 [桌面组合 spec](../../../../../temp/issue-worktrees/agent-linux/tests/e2e/workflows/automation-linux-environment.spec.ts)

```sh
flock /tmp/huhu-heavy.lock xvfb-run -a pnpm exec playwright test tests/e2e/workflows/automation-linux-environment.spec.ts --workers=1
```

## 文件 SHA-256

```text
bebb542c308736198678be53167a58b0a0d951cf746e27c05c9f6d70efae1c46  apps/cli/test/approved-terminal.test.ts
58af142ab8c176abc151312705b696d60ff47f36ca4502786621ecc87c7cb1f1  plugins/automations/src/engine/approved-linux-shell.ts
71f2a8f3a8d4ae3f2a6b3c087823b74f6452401e29eb75ce4b09a4dac2fb32a3  plugins/automations/src/engine/terminal-environment.ts
90a8bcceb5d47540a61c45331fb2119cf7f2e3d969c77e3de9c812f74ea1b5f6  plugins/automations/src/ui/AutomationsModule.tsx
206a11ee1766a49d52cb61468c606e7cfec4d7e0722dcaa71f269797a78f157b  plugins/automations/src/ui/TerminalApproval.tsx
c25f3d9b3618940ab5b21270fc8e953ca73342e36ee564dcf59cf3e1cb825cf6  plugins/automations/src/ui/TerminalEnvironment.tsx
87de2631d4acc3d65787fdd85f94d0a45051ad455e2a05dda4ce8136e4e73d4c  plugins/automations/test/service.test.ts
3f95cdb08d137687743619d08658b227f74322400f18c03f3f2d8eecc700c6c3  tests/e2e/workflows/automation-linux-environment.spec.ts
```

## Core 回告

`hc get t4x` 和中途接口通知均因 Core 锁只读失败。已通过本机终端环境、任务清单和 Git 基线核对归属。

发布后向 `t3p` 执行 `hc send`，同样因 Core 锁只读失败，退出码 5。回告未送达，共享报告已写入。

## Lead 接收（2026-11-22）
已审阅 diff，保存实现提交 dcde4772，合入集成为 fc38dc86。Lead 在集成 Node 24.21.0 定向复跑 service.test.ts，34/34 通过，差异 lint 通过，证据 linux-approval-check.log。接收为候选实现，不代表实际 Linux PTY 或 E2E 已验收；Agent 接线交由 t86 原任务继续，独审 t8g/task01.md。
