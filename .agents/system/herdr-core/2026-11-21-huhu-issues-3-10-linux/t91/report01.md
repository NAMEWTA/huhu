# Linux 受保护交互 Agent 启动与返回

执行结果为 **done（方案分析）**。Lead 为 `t3p`，派遣身份为 `wta-ubuntu/t91`，本机终端与 manifest 指针均为 `t91 / task01.md`。共享根为 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`。任务和报告位于该根下的 `t91/task01.md`、`t91/report01.md`。代码基准为 `d0f50bbb`。本轮仅写此报告。

## 可直接分工的结论

沿用 `resolveAgentLaunch` 给出的命令与参数，在 `InteractiveEnvironment.prepare` 内将安装入口解析为具体执行计划。Pi 使用实际配对的 Node、清单所指的 JS 入口和声明的 bundle 文件。Codex 使用 npm 包选定的原生映像，保留平台包布局和 npm 管理标志。Claude 使用本机已安装的原生映像。三者共用已有的预览绑定、broker 私有交付和 Linux PTY。交互计划额外批准一个返回 shell，监督进程在 Agent 正常完成后启动它，Core 始终持有同一个外层 host。已批准的规则命令沿用一次执行合同。[Issue §9、C01/C02](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/source.md:558) · [原审查第 1、2 项](../t8y/report01.md)

### 入口与批准

| 安装 | 已核对的本机事实 | 实施动作 |
| --- | --- | --- |
| Volta Codex 0.171.0 | `~/.volta/bin/codex` 指向共享的 `volta-shim`。`volta which codex` 返回安装 prefix 下的 `bin/codex`，规范化后是 `@openai/codex/bin/codex.js`。 | 以词法命令名和实际 shim 所属 Volta 安装进行分派。从包装器处解析 `@openai/codex-linux-x64/package.json`，按本版 wrapper 的回退顺序定位 `vendor/x86_64-unknown-linux-musl/bin/codex`。解析前后核对主包名、bin、平台包和目标。保留 `[vendorELF, ...resolverArgs]`、规范主包根 `CODEX_MANAGED_PACKAGE_ROOT` 和该 npm 安装的 `CODEX_MANAGED_BY_NPM=1`，清除竞争的管理器标志。派生值纳入批准，防止后合并的 overlay 改写其意义。 |
| Volta Pi 1.5.2 | `volta which pi` 返回包的 `bin/pi`，最终是 `@earendil-works/pi-coding-agent/dist/bundle/cli.js`。Volta 安装记录 `tools/user/bins/pi.json` 指定 Node 24.22.1。 | 给 `linuxProgram` 传批准 cwd。识别已知的 sibling Volta 和 shim，在该 cwd、无秘密环境以固定参数查询 `which pi`。查询应受时限和输出大小约束，只接受单个已安装的绝对路径。全局包用该包安装时所配的 Node，核对 bin 记录的 name/package/version、实际清单和本地 Node ELF。若 Volta 选中项目直接依赖，按该项目实际选择的工具链配对。禁止把项目当前 `which node` 的结果一概用于全局包。预览只解析本地文件，缺件提示修复安装。 |
| 直接 npm Pi | 本机包清单 `bin.pi` 为 `dist/bundle/cli.js`。入口仅 160 B，通过 `createRequire(import.meta.url)("./cli-runtime.js")` 加载运行时，后者继续导入 chunks。 | 同时接收 npm bin 链接及直接配置的真实 JS 路径，向上找到支持的 Pi 清单，核对实际入口等于清单的 `bin.pi`。直接 npm 的 `env node` 按批准启动的 cwd/PATH 解析，若选中 Volta 的 node shim，继续解到真实 Node。支持已登记的历史包名时按其真实清单选入口。将决定解释器的环境绑定到计划。保留全部模型、会话、恢复文件和位置参数。 |
| Claude Code 2.1.330 | `~/.local/bin/claude` 指向版本化的 `~/.local/share/claude/versions/2.1.330`，为 381121040 B 的 x86-64 ELF。 | 走已有 ELF 身份和摘要核对，保留全部 resolver 参数。启动时复核版本链接，升级后旧预览失效。验证内置资源能在受保护执行方式下加载。此行的覆盖对象是本机原生安装。 |

Huhu `plugins/agent-cli/src/engine/detect.ts` 已移植 ORCA 的 GUI 安装目录回退，保留其优先级。`launch.ts` 继续作为普通、受保护、历史启动的参数来源。Volta 解包是限定于已识别安装的小适配。直接 npm 入口不能被另一个全局包覆盖。源安装与配对信息在每次授权使用前重新解析，出现差异沿既有流程重新预览。[ORCA 命令解析](/home/wta/projects/huhu/temp/sources/orca/src/shared/node-cli-command-resolution.ts) · [Volta which](https://docs.volta.sh/reference/which) · [Volta 工具与 Node 配对](https://docs.volta.sh/guide/understanding)

### Linux 如何固定真正被读取的文件

1. 复用 `NativeLaunchPlan.image/entry/files`、目录身份、SHA-256 和 `launchHash`。Pi 的本版清单加 `dist/bundle/**/*.js` 共 **85 个文件（含入口）**，与已有 Windows 验收数量一致。入口放 `entry`，其余进 `files`，排序、去重，补上本版实际使用且声明固定的资源（如内置亮暗主题 JSON）。Windows TS 普通扫描器遍历整个 `dist`，不宜原样套 Linux 本机 npm 的非 bundle 发布内容。包外按需加载的依赖、用户扩展、系统动态库沿用已批准的安装信任边界。[Windows W7.3 文件与动态依赖合同](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W7.3-native-pty.md:26)
2. 在 `pins_linux.go` 用现有 `openat2/fstat/sha256` 做普通数据文件核对，保留 ELF 专用检查。broker 在消费前检查计划，host 在确认消费前从打开的 fd 复核并固定本次实际读取的字节。建议对 Pi 做**仅覆盖已声明文件的私有包目录**：host 创建每次运行独占的目录，从已核对的 fd 复制并同时哈希，保持 `package.json`、`dist/bundle/cli.js`、chunks 和声明资源的相对层级，文件只读。仅把策略已允许的其余资源目录与 `node_modules` 显式映射到原安装，不让目录链接覆盖已固定的路径。给 Node 真实的主模块路径，进程以批准 workspace 为 cwd。内部入口前缀可指向这份运行副本；预览展示原安装路径，用户参数逐项不变。验证 `PI_PACKAGE_DIR`、主题、包版本识别及从入口相对加载；需要给 Pi 指定资源根时，必须让它指回具备完整对应布局的目录。清理在整个 Agent 进程树退出后执行。独占副本随进程清理，不包含环境秘密。此设计依赖与 Windows 相同的本机用户与安装信任范围。
3. Codex 的平台描述 `codex-package.json` 明列 `entrypoint=bin/codex`、`pathDir=codex-path` 和 `resourcesDir=codex-resources`。本机另有同级 `bin/codex-code-mode-host`。把主包清单、包装器、平台描述和选用的组件身份纳入批准。不要仅凭 `--version` 认定匿名 memfd 保留了相邻路径。上游会使用 `current_exe()` 建自身重执行别名。建议此类需要安装路径的 ELF（包括需要用 `process.execPath` 开子进程的 Node）从**已核对的原映像 fd**启动，保持 canonical 安装路径。Linux 上用户可写的 ELF 还需覆盖校验到 exec 的写入窗口：可在打开的原文件上先取得内核读租约，核对身份、摘要、可执行性，保持至 exec 成功，遇租约中断取消；从 fd exec 后内核的执行映像写保护生效。已批准、非启动用户可写的系统映像可复用已有可信文件判定。该模式应独立于规则 `approvedShell`，不得放宽规则 sh 的指纹合同。对不支持读租约且要求具名映像的安装，另可将已核对的字节复制到专用的只读版本目录，保留相邻资源、自重执行路径和同级工具，核对打开的副本 fd 后 exec。两者均须证明实际执行映像与批准字节相符；原有无路径依赖的 ELF 继续使用密封 memfd。对于可热升级的安装，需用升级或改名负对照验证自重执行时仍使用已批准版本，必要时选版本副本。[Codex 参数分派和自重执行](https://raw.githubusercontent.com/openai/codex/main/codex-rs/arg0/src/lib.rs)
4. 私有协议只带既有环境与批准目标。新增可选 Linux 返回 shell 字段，含 `image/argv`，其有无和内容进入同一个批准摘要。含 `approvedShell` 的启动禁止带返回 shell；直接打开交互 shell 本身也没有第二个 shell。`protocol_linux.go:pinLinuxLaunch` 按映像形状验证，Pi 的 `argv[1]` 必须等于批准的原始入口，再由 helper 内部映射实际副本。对包根、入口、文件、返回 shell argv 延伸已有秘密出现在路径/argv 的检查。保留 1 MiB 帧上限、host/目录身份核对、`ISSUED_ONCE` 与 `RUNNING` 私有回执及原 requestId 对账。

### Agent 退出后如何保留原 pane

- 在同一 host/supervisor 和 inner PTY 内分两次启动。预览时确定并批准实际用户 shell 和上游相应的 `-i` 或 `-li`，平台缺省沿用 shell 选择规则。保存已打开的 cwd fd、返回 shell fd 和启动前的 slave termios。Agent 保持前台和控制 TTY；Agent 退出后等待并回收其后代，恢复 termios，在仍有效的外层租约下将同一 slave 交给新的交互 shell，恢复前台进程组、尺寸和 Ctrl-C 行为。Guard 已保留 slave 的标准句柄。现实现会在第一子进程启动后关闭 cwd fd，这里应延至第二阶段启动。恢复 shell 启动失败时给出固定宿主失败状态。上游 `unix_agent_argv` 提供 shell 种类、登录模式及参数边界；受保护执行继续由 helper 逐个 argv 启动。[Herdr App 上游](/home/wta/projects/huhu/temp/sources/herdr-app/src/window.rs:111)
- 保护值仅交付第一阶段 Agent 及其正常继承的子进程。返回 shell 的 env 从已批准普通环境单独构造，剔除全部 `protect` 名和 provider 包装器专用变量，绝不从第一阶段已合并的环境直接继承。保留普通用户环境；host 持续遮蔽至 Agent 尾帧排空。Core 的 `terminal.run` 仍使用 host 的公开 argv 与 `keep:false`。Core 主动停止、host 租约关闭、首次启动失败、清理失败均终止，不能产生返回 shell；第二阶段同样受租约关闭和后代回收约束。
- 监督进程在第一阶段结束时输出固定的可读诊断，如 `HUHU_PTY AGENT_EXIT 17`（信号退出沿用 `128+signal`）。它让操作者区分 Agent 结果与 shell 结果；终端文本不用作可信启动或审批回执。shell 退出才由 host 输出最终 `CHILD_EXIT` 并向 Core 返回 shell 的状态。规则 `sh -c` 继续直接上报其退出码，目录、一次消费和回包不变。Windows ConPTY 的现有遮蔽、等待与状态标记可参考；它现有的 `runInner` 自身只等待一次。

### 文件归属和 Lead 验证

- **Engine** — 实施者承担 `interactive-environment.ts` 和其直接测试。保留 `launch.ts/detect.ts` 的通用语义。`native-pty.ts` 由 t86 持有，Lead 应统一接入可选的 Linux 返回 shell、数据文件身份取得方式和计划类型。`sessions.ts` 仅在需要展示额外的安装/返回 shell 摘要时由持有人接线。回包恢复、普通输出处理和 Automations 仍由 t86 交付。
- **Go helper** — `protocol.go` 的可选字段、`main_linux.go/pins_linux.go` 的数据文件与具名映像、`protocol_linux.go` 的校验与 fd 生命周期、`console_linux.go` 的分阶段 PTY。当前 t86 也在修改 `console_linux.go`，Lead 应在其改动落定后整合。协议说明和验证脚本跟随最终字段。Windows 原生分支继续沿用现有消息形状。
- **真实 provider** — Lead 在隔离 Core、测试 Vault 和独占目录下，分别从 Volta Codex、Volta Pi、直接 npm Pi、原生 Claude 的真实入口进行预览、批准、运行。先记录实际选择的入口/解释器、脱敏 argv/cwd 与批准摘要，再看真实 welcome/登录或输入界面；Pi 发送 `/session`、`/quit` 以覆盖真实主题和 bundle；Codex 追加一次不需模型的随包资源或自重执行检查；Claude 覆盖自身 TUI 和正常退出。模型、带空格/中文的目录、已有测试恢复文件都以独立 argv 传递。隔离环境从白名单重建，设独立 HOME、XDG 各目录、TMPDIR、CODEX_HOME、PI_CODING_AGENT_DIR、CLAUDE_CONFIG_DIR；cwd 使用无项目指令的测试目录。通过受控的安装根定位已装软件，仅使用合成环境值和隔离历史，无需账号、联网模型请求或读取真实历史。
- **对应断言** — 每次记录原 Core address 和 pane，Agent 自然返回后，在同 address 输入 shell 内建命令确认 cwd、普通值、保护变量不存在、终端尺寸及输入正常，再 `exit 23`，Core 最终取得 23。已有非零 Agent 夹具可精确验证第一阶段 17；规则命令写一次计数后退出 17，应只有一次副作用并直接结束。补批准后更换解释器、入口、chunk、Codex 版本链接的拒绝用例，以及获批后修改原 Pi 文件仍只执行已批准字节。沿用现有输出遮蔽和 Core 落盘断言，检查两阶段均无秘密值。真实 provider 入口记录与合成夹具结果分列。

**本次实际验证**：本机 `volta which`、Volta 包与 Node 配对记录、两份 npm 清单及包装代码、Claude 规范路径和 ELF 类型均已核对。在独立临时 HOME、XDG、provider 配置和中文带空格 cwd 中，真实安装的 Codex JS 包装器、Pi JS 入口（固定 Node 24.22.1）和 Claude ELF 各执行一次 `--version`，分别返回 `codex-cli 0.171.0`、`1.5.2`、`2.1.330 (Claude Code)`，均退出 0。新建环境未带真实凭据；只检查了软件安装元数据。

**未运行的验证与待定点**：未执行受保护链路、Go 构建、Vitest、Electron/Playwright、全仓类型检查或打包。真实版本输出仅证明安装入口可执行。具名 ELF 的读租约在目标安装文件系统上的可用性，以及 Codex 自重执行和 Pi 资源/包管理器识别在所选路径下是否保持，须由 Lead 用真实安装定向核实。返回 shell 的进程组、切换时的取消和跨阶段退出码也须经真实 PTY 核实。

## Lead 收取
方案已收取，按现有Windows信任边界实施，不扩大为通用沙箱。t8k/task03持有provider解析、native协议与Go两阶段PTY；t86继续会话恢复与Automations。真实运行与安装路径局限须由Lead验证，不以本报告版本查询代验。
