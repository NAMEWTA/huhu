# task01.md #4/#5 Agent 原生执行宿主在 Linux 上可用并可验证（联验①前置）

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t10`
- 身份核对 — 本机 Linux 默认 Core，终端名 `p4-linux`，worker 内 `HC_TERMINAL_ID` 应为 `t10`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`（分支 `impl/huhu-issues-3-10-agent-linux`，HEAD = 集成 `22e91432`，已含 origin/main 的 #2 收尾、#9 P0.1 跨平台本机凭据保护与测试注入点 `BootOptions.moduleCredentialProtection`）
- 接续依据 — 盘点报告 `t7/report01.md`（同共享根）的「跨成员契约」与「三条组合联验 ①」；#4 Change `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/`（W6.x、W7.x、W8.x 任务与 evidence），#5 Change `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/`（T3.x、T6.x、T7.x）。

## 目标与输入

之前所有原生执行验证都在 Windows。以下生产代码对平台有硬条件，使 Linux（及 macOS）上 Huhu 无法用真实 Codex 执行 Task，联验①在 Linux 不能跑：

- `plugins/agent-cli/src/engine/codex-dispatch.ts:106` `available` 要求 `process.platform === "win32"`。
- `plugins/agent-cli/src/engine/interactive-environment.ts:69,117` 只认 `codex-win32-x64` 原生路径且要求 win32/x64。
- `plugins/agent-cli/src/engine/protected-launch.ts:109`、`protected-launch-helper.cjs:94` 的 Windows 控制台分支（检查 POSIX 分支是否完整）。
- 以及 `plugins/agent-cli/test/` 中 `*.live.test.ts`、`protected-launch.test.ts`、`launch-reconcile.test.ts`，`apps/engine/test/{codex-dispatch.live,task-dispatch.live,agent-workspace}.test.ts`，`apps/cli/test/approved-terminal.test.ts` 的 `skipIf(process.platform !== "win32")`。

目标：在不削弱任何安全不变量的前提下，让 #4 的受控 Codex 派遣、交互受保护启动与原生回执在 Linux 上真正工作，并让上述 live 测试在 Linux 上实际运行并通过。尤其是 `plugins/agent-cli/test/native-receipts.live.test.ts` 的「MCP and CLI dispatch and answer through the same Core session and production Tasks inbox」和「Engine recovers both lost ACKs for the same native receipt without another input」——它们是联验①的自动化主体。

本机资源：Codex CLI `codex-cli 0.170.0`（`/home/wta/.volta/bin/codex`，Volta shim；核对实际原生二进制位置，Linux 上 `@openai/codex` 的原生包名形如 `codex-linux-x64`/`x86_64-unknown-linux-musl`，以本机实际安装为准）；Herdr Core Linux 二进制 `apps/desktop/resources/herdr/linux-x64/herdr-core`（0.1.19，与锁一致）；Pi 如可用则用，否则只记缺失。模型端一律用测试里已有的回环合成 Responses/App Server 夹具，不得调用真实模型服务、不得使用用户的 `~/.codex` 登录态或历史（为测试设隔离 `CODEX_HOME`/`HOME`），不得读写真实 Codex 会话历史。

要求：
1. 先读 Windows 版本实现与证据，弄清每个 win32 条件保护的是什么（例如 Windows 控制台/句柄继承、原生二进制定位、helper 进程权限）。在 Linux 上用等价机制实现（例如 POSIX `spawn` + 受控 env、文件描述符不继承、`0700` 目录），不能简单删掉条件。macOS 走同一 POSIX 路径但本轮不验证，报告中列为未测。
2. 只改 `plugins/agent-cli/**` 与相关测试；`apps/engine/test/*.live.test.ts`、`apps/engine/test/agent-workspace.test.ts`、`apps/cli/test/approved-terminal.test.ts` 的平台限定可改。若需要 `apps/engine/src/boot.ts` 或桌面打包（例如随包 helper 路径、Linux Codex 定位）的变更，写在报告中由 Lead 接线，或在本分支做最小改动并单列。
3. 让上述 live 测试在 Linux 实际执行；若某用例依赖真正只有 Windows 才有的行为（如 ConPTY 特性），保留限定并写明理由，同时补一个 Linux 等价用例。
4. 更新 #4 evidence：`.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/evidence/W-linux-native-execution.md`，记录实际 Codex/Core 版本、命令、通过/失败/跳过计数、未测平台。

## 读写范围与产物

- 可读范围 — 整个仓库、`/home/wta/projects/huhu/temp/sources`。
- 可写业务范围 — `plugins/agent-cli/**`、上面点名的测试文件、#4 evidence 目录。
- 禁止改动 — 公共契约（`packages/contracts`）、`packages/kernel` 能力分发、Vault 包收集器、插件注册、根 `package.json`/`pnpm-lock.yaml`（需要依赖时停下交回 Lead）、#9/#7/#8 插件。不 push，不启动子 agent。
- 提交方式 — 沙箱无法写 Git 索引，按 topic「决定与交接」中的临时索引方式生成候选提交（父为 `22e91432`），在报告给出 SHA，并保持工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。

## 验收与验证

- 点名 live 测试在 Linux 上实际运行（不是 skip），列出每个文件通过/失败/跳过计数。
- `pnpm test` 全量对比：放开前后计数；无新增失败。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 退出 0。
- 报告写明：每个 win32 条件的原保护目的 → Linux 等价实现 → 证据；Lead 接线清单；macOS 未测。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址 `t10` 与任务文件名。manifest 当前行须为 `t10	task01.md	active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只在给定范围内写业务产物；协作文件只写自己的报告和同目录临时稿。
4. 按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md` 格式：`report01.md.tmp` → `ln report01.md.tmp report01.md && rm report01.md.tmp`。
5. 发布后在终端打印报告绝对路径并停下。
