# Linux 真实 provider 与交互返回实施报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- Core — `wta-ubuntu`，执行者 `t8k`，Lead `t3p`
- 任务 — [task03.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8k/task03.md)
- 工作树 — `agent-linux`，`impl/huhu-issues-3-10-desktop-web-verify`，HEAD `5a4de7ae`
- 结果 — 首轮实现与验证用例已交回，实际 Go/PTY/真实 provider 验收待 Lead 串行执行

## 实施

- 在原 `InteractiveEnvironment.prepare` 收取 resolver argv 和批准工作目录。Volta 只走已识别同目录 shim 的固定 `which` 查询，查询环境限于安装定位，且有超时与输出上限。全局 Pi 按 Volta 的 bin 记录核对包名、版本及 Node 配对。项目选择的 Pi 按同目录上下文取得 Node。直接 npm Pi 识别清单、真实 JS 入口与 Node shebang，按批准 cwd 和 PATH 解析解释器。Codex 核对 wrapper、主包与平台包清单、平台描述及 vendor 组件。原生 Claude 固定规范版本映像。resolver 的模型、会话文件和其他参数仍逐项传递。 [Linux 解析器](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/agent-cli/src/engine/linux-interactive-program.ts:205)
- 有名映像采用每次运行独占的版本副本。broker 核对原始文件与解析记录，host 在私有消费回执前从打开且核验过的 FD 复制声明文件，保留 Codex 相邻资源和 Pi 的 bundle／chunk／内建主题相对布局。宿主核对副本映像，以该 FD 启动，避免匿名 memfd 改变正常的具名映像路径。解释器、入口、chunk、清单、Volta 全局记录及入口别名进入审批；更换链接或原文件时，旧计划会在重新预览或原生核对阶段失效。仅绑定 Pi 声明的本地和 hoisted Node 模块目录，未声明依赖仍在已有安装信任边界内。 [版本副本](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/native/agent-pty/installation_linux.go:51)
- 交互启动在同一 host 内让 supervisor 持有控制终端，前台 Agent 退出后先回收其后代、恢复 termios，再启动已批准的交互 shell。shell 继续使用原 cwd 与 PTY，继承普通变量，剔除受保护变量和重复携带受保护值的普通值。Agent 专用的包根环境在初次启动时生成。公开诊断记录 Agent 的退出码，外层 host 最终返回 shell 的退出码。管道关闭、挂断、首阶段启动失败和清理失败均沿原有生命周期结束。自动化 `approvedShell` 使用原映像 FD 单次执行并直接结束，继续使用规则 `***` 遮蔽及保留原字面 `[REDACTED]`。 [两阶段监督](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/native/agent-pty/console_linux.go:231)
- 版本副本依赖可执行的本机临时文件系统与已有同用户安装信任边界。正常收尾和已接管监督阶段的挂断都会清理。若宿主在副本创建后、监督进程收到私有帧前被强制杀死，可能遗留只含安装文件的临时副本。Lead 已验证 device 2050 支持读租约，本轮选择私有副本，使映像相邻文件与重执行路径一起固定。 [Lead 读租约探针](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/linux-read-lease-probe.json)

## 接口与合并

- `NativeLaunchPlan` 新增可选 `linuxInstallation`（`codex-npm`、`pi-node`、`claude-native`，含根、声明依赖目录、别名和解析记录）与 `returnShell`（核对的映像、`[path, "-i"]` 与可选原链接）。`entry` 与 `files` 沿用既有字段。Windows 输入继续按既有形状，Windows helper 拒绝 Linux 专属字段。随包 Linux helper 与 Engine 需要同步更新。 [私有协议](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/native/agent-pty/PROTOCOL.md)
- `sessions.ts` 直接使用现有的 resolver、重算批准和 `broker.start(..., plan.launch, ...)` 接口即可。公开 Core argv、host PID 核对、`ISSUED_ONCE`、`RUNNING`、`waiting`、`inspectHost` 和 `start` 的回执语义沿用现状。返回 shell 使用原 host，所以 Core 的一次请求仍对应同一个终端 ID。
- 四份带入改动来自 Lead 的 `be992934`。当前 `mask.go` 与 `mask_test.go` 已逐字节比对该提交，`console_linux.go` 保留规则遮蔽分支，`native-pty.ts` 保留 broker 等待信号。Lead 合入时可按该基底去重。

## 来源与许可

- 交互返回语义参考本地 Herdr App `0ac92e4e9d5dea2097375c26e6a0cb194a75c2f0` 的 `src/window.rs`，Apache-2.0。沿用 Linux 交互 `-i`、参数边界和返回 shell 行为，由 Huhu 的 Go 监督进程实现。 [Herdr App 源码](/home/wta/projects/huhu/temp/sources/herdr-app/src/window.rs:102)
- 复用 Huhu 已登记的 ORCA `7041ea022826ec19d627cd3a129b665822e7bf0a` 检测回退和 resolver，MIT。继续使用已锁定的 `creack/pty v1.1.24`（`edfbf75025b0ba4ee17c19f52d9b600fad80a787`，MIT）、`x/term v0.46.0`（`6226200ed12cba417a9d9e799c2a7179d3fc0e27`，BSD-3-Clause）、`x/sys v0.50.0`（`4cf4b81b1cac43cba7763c1f9a1fcb1c4344`，BSD-3-Clause）及 Go 的 Unix 子进程接口。依赖版本和分发许可沿用原登记。 [源登记](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/docs/upstream/ledger.md)
- 实际核对的安装元数据为 Volta 的本机配对记录、`@openai/codex 0.171.0` 及其 Linux x64 平台包（Apache-2.0）、`@earendil-works/pi-coding-agent 1.5.2`（MIT）及 Claude Code 原生 `2.1.330` 版本路径。适配来自本机发布包的结构与行为，无 provider 源码或二进制随本补丁交付。发布包清单没有记录 gitHead。 [安装分析](../t91/report01.md)

## 实际验证与未运行项

- Node 24.21.0，`pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/agent-cli/test/linux-interactive-program.test.ts --maxWorkers=1`，合成用例 **3 通过**，真实安装用例 **4 跳过**。通过项覆盖全局 Node 配对和项目 Node 区分、直接 npm Pi 的解释器／入口／chunk 替换使审批变更、Codex 平台布局、Claude 路径和独立 shell。用例使用探针夹具，未以其结果认定真实 ELF 启动通过。
- 5 份 TS/TSX 文件定向 `oxfmt --check`、Go 源码 `gofmt`、两份 Python 验证脚本的语法解析和 `git diff --check` 通过。
- Go 测试与构建、真实 PTY、真实 provider、Electron/Playwright、Windows helper 运行、全仓门禁、打包均未运行。真实 Codex 资源路径和具名映像重入、真实登录／未登录界面、同 PTY 启动和中断收尾仍需按下列命令实测。原生 probe 可验证具名路径上的重入，Codex 应用自身发起的所有内部子模式需要额外的产品运行证据。

## Lead 复验

先使用源码构建 helper，串行运行 Go 与合成 PTY。合成用例含 Agent 退出 17、返回 shell 退出 23、cwd／尺寸／termios、前后两阶段宿主中断回收、原映像替换拒绝，以及批准 sh 单次退出和遮蔽。

```sh
bash native/agent-pty/build.sh --test
native_fixture_dir="$(mktemp -d)"
(cd native/agent-pty && go build -mod=readonly -o "$native_fixture_dir/agent" ./tests/linux-fixture)
python3 native/agent-pty/tests/verify-linux.py --helper native/agent-pty/bin/huhu-agent-pty --fixture "$native_fixture_dir/agent"
```

真实安装验证使用 Lead 已核对的 bwrap 仅回环命名空间及可写私有临时目录。以下环境变量传给命名空间内的 runner。直接 npm Pi 用相同发布包的实际 JS 入口明确绕过 Volta 的 `pi` shim。

```sh
export HUHU_REAL_PROVIDER_HELPER="$PWD/native/agent-pty/bin/huhu-agent-pty"
export HUHU_REAL_VOLTA_CODEX=/home/wta/.volta/bin/codex
export HUHU_REAL_VOLTA_PI=/home/wta/.volta/bin/pi
export HUHU_REAL_DIRECT_PI=/home/wta/.volta/tools/image/packages/@earendil-works/pi-coding-agent/lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js
export HUHU_REAL_NODE=/home/wta/.volta/tools/image/node/24.22.1/bin/node
export HUHU_REAL_CLAUDE=/home/wta/.local/bin/claude
pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/agent-cli/test/linux-interactive-program.test.ts -t '真实 provider' --maxWorkers=1
```

真实用例经 resolver 生成计划，使用隔离 HOME、XDG 与 provider 配置目录。在同一个真实 broker/host 中分别覆盖实际 `--version`、交互界面与返回 shell。Pi 走 `/session` 和 `/quit`，Codex 和 Claude 走离线启动界面与终端退出。Codex 的探针检查实际运行映像哈希、具名路径、声明资源和相邻 sidecar，再用具名路径重入一次。脚本输出为独立 provider 证据。 [真实安装验证脚本](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/native/agent-pty/tests/verify-real-provider.py)

Electron 定向文件 `tests/e2e/agents/linux-environment.spec.ts`。为现有「Linux 受保护 Agent 在 Safe 三态使用真实 PTY、键盘和 resize，并回收后代」增加同终端返回 shell 的断言。复验沿用隔离 Secret Service、`HUHU_AGENT_LINUX_PROBE` 及当前候选 helper 配置。 [桌面用例](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/agents/linux-environment.spec.ts:203)

## 文件清单

- `plugins/agent-cli/src/engine/interactive-environment.ts`
- `plugins/agent-cli/src/engine/linux-interactive-program.ts`
- `plugins/agent-cli/src/engine/native-pty.ts`
- `plugins/agent-cli/test/linux-interactive-program.test.ts`
- `tests/e2e/agents/linux-environment.spec.ts`
- `native/agent-pty/PROTOCOL.md`
- `native/agent-pty/README.md`
- `native/agent-pty/console_linux.go`
- `native/agent-pty/installation_linux.go`
- `native/agent-pty/installation_linux_test.go`
- `native/agent-pty/mask.go`（Lead 带入）
- `native/agent-pty/mask_test.go`（Lead 带入）
- `native/agent-pty/pins_linux.go`
- `native/agent-pty/protocol.go`
- `native/agent-pty/protocol_linux.go`
- `native/agent-pty/protocol_windows.go`
- `native/agent-pty/tests/linux-fixture/main.go`
- `native/agent-pty/tests/verify-linux.py`
- `native/agent-pty/tests/verify-real-provider.py`

## Lead实程验证
候选8aad86e4→6874c619；探针935f2030→6a510e6f。t9c Go测试/构建通过，t9h定向E2E types/lint及Windows交叉编译通过；t9j五个真实PTY场景通过。t9n在独立netns、降回wta与白名单环境中，四种实际provider的version与interactive均返回原host的shell并最终退出23，4/4通过。此前bwrap探针memfd exec EACCES属测试环境，保留t9f/t9k失败日志；t9m因隔离HOME缺Corepack缓存提示被Lead结束，未执行测试。最终包/Electron未验。
