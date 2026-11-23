# task03.md Linux Git askpass 环境清理与 Mail AI 停用保存泄露 Key（两项修复）

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t6`
- 身份核对 — 本机 Linux 默认 Core，worker 内 `HC_TERMINAL_ID` 应为 `t6`。
- 当前任务 — `task03.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/task03.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/report03.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-safe-git`，HEAD 已快进到集成 `5021f54c`（含 Mail AI、H11.2、#4 Linux 派遣与 Lead 修复）
- 接续依据 — t6/report02（发现 1）；独立审查 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t11/report01.md` 的 #8 P1。

## 目标与输入

两项独立的缺陷修复，各自一个候选提交（可以同一父链上先后两个提交）。

1. **Versioning Linux askpass 未清理 Git 调试环境。** 你在 task02 发现 `plugins/versioning/src/engine/sync.ts:279–294` 的 POSIX askpass 分支没有执行 Windows 分支的环境清理，`remote-auth.engine.test.ts` 的 HTTPS 安全专项在 Linux 上实测生成了被禁止的 Git trace 文件。让 POSIX 分支与 Windows 分支执行同一份环境清理（GIT_TRACE*、GIT_CURL_VERBOSE、GIT_ASKPASS 覆盖等，以 Windows 分支实际清理的集合为准，必要时抽出共享函数），并把该 HTTPS 安全专项改为在 Linux 上也运行（askpass 机制按平台各自实现即可）。#9 Git 凭据规格见 `.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence-p4-versioning-cutover.md` 与 P4.x 任务。
2. **Mail AI 停用保存可把已保存 Key 写进可移植配置（审查 P1，已复现）。** 位置 `plugins/mail/src/engine/ai-settings.ts:203,207,213,227,232`，相关 `packages/vault/src/package/package.ts:24,37`。触发：已保存 HTTPS Key → 保持同一地址 → 取消「启用邮件 AI」→ 选择保留 Key → 把已有 Key 误填进模型字段 → 保存时 `verify=false`，`check(undefined)` 跳过对已保存 Key 的字段检查，Key 明文进入设置响应、普通读取和整 Vault 包。修复：把「可移植字段不得包含当前或新 Key」的检查从网络验证中分离，在保留、替换、清除和停用保存时都执行（能读到当前 Key 时与之比对）。补测试：停用保存可用且零网络请求；设置响应、`mail.ai.getSettings` 与导出的整 Vault 包中都不含合成 Key；正常保存路径不回归。规格见 `.agents/dev/changes/2026-11-19-issue-8-mail-module/` 的 S7.1 任务与 `evidence-S7.1-mail-ai-settings.md`。

## 读写范围与产物

- 可写业务范围 — `plugins/versioning/src/engine/**`、`plugins/versioning/test/**`、`plugins/mail/src/engine/ai-settings.ts` 及 Mail 测试、两个 Change 的 evidence 目录（证据写进候选树）。
- 禁止改动 — `apps/engine/**`、`packages/**`（若必须改 Vault 包逻辑，停下交回 Lead）、插件注册、根锁文件。不 push，不启动子 agent。
- 预期产物 — 候选提交 SHA、证据、报告。

## 验收与验证

- 两项修复各有先失败后通过的回归（报告里写出修复前失败的输出摘要）。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 通过；`plugins/versioning` 与 `plugins/mail` 全部 vitest 通过，计数写入报告。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址与任务文件名；manifest 当前行须指向本任务且为 `active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只在给定范围内写业务产物；协作文件只写自己的报告和同目录临时稿。
4. 提交方式：按 topic「决定与交接」第 2 条用临时索引生成候选提交（父为当前分支 HEAD `5021f54c`），在报告给出 SHA，保持工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
5. 报告格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：先写同目录 `.tmp`，再 `ln` 发布并删除临时稿；发布后打印报告绝对路径并停下。
