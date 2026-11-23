# task01.md #9 P0.1 模块凭据本机保护：Linux / macOS 后端与确定性测试

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t6`
- 身份核对 — 本机 Linux 默认 Core，终端名 `p9-safe`，worker 内 `HC_TERMINAL_ID` 应为 `t6`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`（分支 `impl/huhu-issues-3-10-safe-git`，HEAD `4d86c84b`）
- 接续依据 — 无。完成后 Lead 会在同终端派发 task02（#9 P8.3）。

## 目标与输入

Lead 在 Linux 上对 `4d86c84b` 跑 `pnpm test`：1261 通过、15 失败、61 跳过。15 项全部是 `SSH_AUTH_FAILED`「SSH 本机认证不可用」，分布在 `apps/engine/test/engine.test.ts`（3 项）和 `plugins/ssh/test/{file-properties,forwarding,monitor,preferences,public-resources}.engine.test.ts`。日志：`/home/wta/projects/huhu/temp/issue-baseline/linux-4d86c84b-test.log`。

根因：`apps/engine/src/module-credential-host.ts` 的 `WindowsCredentialProtection.entry()` 只在 `win32/x64` 上可用，其他平台一律抛 `LocalProtectionError("unavailable")`。于是 Linux、macOS 上所有模块自有凭据（SSH、Git/versioning、Mail、Agent CLI、Automations）都不可用。CI 的 `ubuntu-22.04` 与 `macos-15` 任务也会因此失败。#9 设计方案 A 选的是 `@napi-rs/keyring`（三平台：Windows Credential Manager、macOS Keychain、Linux Secret Service），P0.1 要求记录三平台可用/不可用矩阵，并在 Linux 缺保护后端时给出可修复错误。见 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/design.md`（方案 A/B 表格及其后段落）、`spec.md`、`tasks/P0.1-local-protection.md`、`tasks/P0.2*`。

要交付的结果：

1. 生产保护：在 `@napi-rs/keyring` 支持的平台（至少 linux-x64、darwin-x64/arm64、win32-x64，按实际随包的原生绑定核对 `apps/desktop` 的打包配置与 `electron.vite.config.ts` 中 keyring 的处理）启用同一系统钥匙串保护。不允许明文或弱回退。后端缺失、会话锁定或 D-Bus 不可达时仍返回 `unavailable`，已有密文不得被新钥匙覆盖（保持现有 `create` 的“已存在即拒绝”语义）。类名改为不再暗示仅 Windows。
2. 确定性测试：上述 15 项测试测的是 SSH/Engine 行为而不是系统钥匙串，在没有 Secret Service 的 CI 上也必须稳定。给 Engine 的受信装配加一个只供进程内测试使用的保护注入点（例如 `BootOptions` 中可选的 `moduleCredentialProtection`，类型为 `LocalCredentialProtection`），测试用 `packages/kernel/test/fixtures/credentials.ts` 的 `TestProtection` 或同等内存实现。这个注入点不能经 HTTP、CLI、MCP、环境变量或 renderer 触达，生产 desktop/CLI 启动路径不传它。改这 15 项及其共用夹具使用它。
3. 真实平台验证：把 `apps/engine/test/module-credential-host.test.ts` 中仅 Windows 的真实钥匙串用例扩展为“当前平台真实后端可用时运行”（本机 Linux 有 gnome-keyring 的 `org.freedesktop.secrets`）。只用随机合成 keyId 与合成值，用例结束时删除它创建的每个条目，并在报告中列出验证清理的方式。另加一个用例覆盖“后端不可用 → unavailable、已有密文保留”。
4. 记录矩阵：在 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/evidence/P0.1-protection-platform-matrix.md` 写实测（本机 Linux）与未测平台（macOS、Windows 本轮未测，引用 Windows 旧证据但注明是旧提交）。

## 读写范围与产物

- 可读范围 — 整个仓库。
- 可写业务范围 — `apps/engine/src/module-credential-host.ts`、`apps/engine/src/boot.ts` 中仅限 `BootOptions` 的新可选字段与 `createModuleCredentialHost` 调用处、`apps/engine/test/**`、`plugins/ssh/test/**`、`plugins/*/test/**` 中因夹具变化必须同步的测试、`packages/kernel/test/fixtures/**`、`apps/desktop` 中与 keyring 原生绑定打包相关的配置（如必须改，报告里单列）、上述 evidence 文件。
- 禁止改动 — 其他 Engine 装配与能力注册、公共契约、插件业务源码、Vault 包收集器、根 `package.json`/`pnpm-lock.yaml`（如确需新增依赖，停下交回 Lead）。不 push，不启动子 agent，不碰真实 Vault；系统钥匙串只写本任务测试的合成条目并清理。
- 预期产物 — 本分支上的提交、证据文件、报告。

## 验收与验证

- `pnpm test` 全量在本机 Linux 退出 0（或列出与本任务无关的剩余失败及证据）；分别记录通过/失败/跳过计数。
- 新增/修改用例：注入点仅在进程内可用（加一个断言或审阅说明，证明 HTTP/CLI/MCP 无法设置它）；真实 Linux 后端往返与清理；不可用路径。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 退出 0。
- Node 24.21.0 已在 PATH 前；依赖已装好。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址 `t6` 与任务文件名。manifest 当前行须为 `t6	task01.md	active`。
2. 先查报告路径。已有身份匹配的终稿则仅打印路径；身份不符则停止说明。
3. 一个终端同时执行一项任务。上下文丢失时先查已有产物与 git 状态。
4. 只在给定范围内写业务产物。协作文件只写自己的报告和同目录临时稿。
5. 按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md` 格式完成报告：先写 `report01.md.tmp`，核对身份后用不覆盖目标的方式发布（`ln report01.md.tmp report01.md && rm report01.md.tmp`）。
6. 终稿发布后在终端打印报告绝对路径并停下。
