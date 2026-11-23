# task02.md 让仅因模块凭据而限定 Windows 的测试在 Linux 运行

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t6`
- 身份核对 — 同 task01。
- 当前任务 — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/report02.md`
- Lead 回告方式 — 发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-safe-git`。
- 接续依据 — task01/report01 已被 Lead 验收后才开始；在 task01 的提交之上继续。

## 目标与输入

集成分支上有 25 个测试文件用 `test.skipIf(process.platform !== "win32" ...)` 限定 Windows，在 Linux/macOS CI 上从不运行（Lead 列表见下）。其中很多只是因为模块凭据原先仅 Windows 可用。task01 交付跨平台本机保护和进程内测试保护注入点后，逐个判断每个文件的限定理由：

- 只因模块凭据/系统钥匙串 → 改为在所有平台运行（使用 task01 的注入点或在后端可用时运行），去掉 Windows 限定。
- 依赖真实 Windows 机制（`.cmd` 垫片、Windows 路径语义、Credential Manager 本身的行为、ConPTY 等） → 保留限定，但在测试名或注释里写明真实理由；若同一行为有平台无关的部分，可拆出不限平台的用例。
- 依赖真实外部 CLI（Codex、Pi、Claude）或 Herdr Core 的 live 用例（`*.live.test.ts`）→ 本任务只记录它们在 Linux 上缺什么（例如 Core Linux 二进制已在 `apps/desktop/resources/herdr/linux-x64/herdr-core`，Codex 在 PATH 上为 `codex-cli 0.170.0`），不改业务；如果只差平台判断且 Linux 上能用同一夹具跑通，可以放开并实际运行，否则列入报告交给 Lead。

文件列表：
plugins/ssh/test/host-auth.engine.test.ts、plugins/safe/test/external.engine.test.ts、plugins/versioning/test/remote-auth.engine.test.ts、plugins/mail/test/{accounts,conversations,ai-selection,draft-attachments,drafts,outbox,oauth-catalog,messages,sync,ai-settings,oauth}-engine*.test.ts（按实际文件名）、plugins/agent-cli/test/{native-receipts.live,native-stop.live,launch.live,dispatch.live,protected-launch,launch-reconcile}.test.ts、apps/engine/test/{codex-dispatch.live,task-dispatch.live,module-credential-host,agent-workspace}.test.ts、apps/cli/test/approved-terminal.test.ts。

注意：本工作树基于 `4d86c84b`，尚无 Mail AI 的两个测试文件（`ai-settings-engine.test.ts`、`ai-selection-engine.test.ts`），Lead 已把 Mail AI 合入集成 `85770368`。不要把集成合并进本分支。本任务只处理本工作树里存在的文件；Mail AI 两个文件由 Lead 在集成上按你报告的同一做法处理。

## 读写范围与产物

- 可写业务范围 — 上述测试文件及其共享测试夹具（`*/test/**`、`packages/kernel/test/fixtures/**`）。不改业务源码；若某测试暴露 Linux 上的真实业务缺陷，记录复现与位置，交 Lead，不在本任务修。
- 禁止改动 — 同 task01。
- 预期产物 — 本分支上的提交和报告。报告列一张表：文件 → 原限定 → 处理（放开/保留+理由/拆分）→ Linux 实际运行结果（过/败/跳过计数）。

## 验收与验证

- 放开的文件在本机 Linux 实际运行通过；`pnpm test` 全量计数前后对比。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check` 退出 0。
- 系统钥匙串只写合成条目并清理（若有用例使用真实后端）。

## worker 执行约定

同 task01（报告用 `report02.md.tmp` → `ln` 发布 → 打印路径并停下）。
