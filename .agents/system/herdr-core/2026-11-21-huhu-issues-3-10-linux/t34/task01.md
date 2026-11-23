# task01.md #7 剩余切片：H2.5、H2.6、H3.1–H3.5、H4.3、H5.1–H5.4、H11.3

## 定位

- 共享根、topic、manifest 同其他任务。terminal_address — `t34`（实际终端见 topic 末条）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t34/task01.md`；报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t34/report01.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-ssh-ui`，HEAD `82f0d188`（集成最新）。候选父为 `82f0d188`。

## 目标

逐个对照 `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/` 下这些切片与当前代码分类（已完成 / 部分 / 缺失），只补缺口，按顺序：H2.5 密钥库、H2.6 草稿测试连接、H3.1 信任与待答、H3.2 路由编辑、H3.3 路由尝试、H3.4 配置同步、H3.5 代理共享、H4.3 分栏布局、H5.1 终端视图、H5.2 终端动作、H5.3 终端历史、H5.4 本地 Shell、H11.3 入口一致性。#7 以 Motty v0.4.12 为基线（`temp/sources` 中的检出与 `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/` 的来源索引），先复制成熟实现再做宿主适配；采用上游代码时更新来源台账（文件、提交、许可证、改动）。

## 与并行实施者的边界（强制）

另一实施者 `t47` 正在同一插件的 Engine 层写外部主体自有对象（任务 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2y/task05.md`）。你**不得修改**：`plugins/ssh/src/engine/capabilities.ts`、`plugins/ssh/src/engine/index.ts`、`plugins/ssh/src/engine/public-*.ts`、`plugins/ssh/src/engine/host-intents.ts`、`plugins/ssh/huhu-plugin.json` 及它们的测试 `plugins/ssh/test/public-resources.engine.test.ts`、`domain-exposure.engine.test.ts`。需要新的 Engine 能力或注册时：新逻辑放新文件（或你独占的既有领域文件），在报告「需 Lead 接线」节给出要加到 capabilities/index/manifest 的精确行（descriptor 从同一源导出），新能力一律 `exposable: true`、`defaultExposed: false`。

## 职责边界（AGENTS.md「实施者职责边界」，强制）

- 只写业务代码、对应单测与 E2E spec；只跑改动涉及的单个 vitest 文件；改 ssh 源码后跑 `pnpm exec tsc --noEmit -p plugins/ssh`（单包类型检查允许）。
- 禁止 `pnpm build`、打包、全量 test、全仓 typecheck/lint/knip/format:check、启动 Playwright/Electron/xvfb、截图。E2E 只写不跑。写报告用带引号 heredoc。
- 可写范围：`plugins/ssh/src/ui/**`、`plugins/ssh/src/shared/**`、上述禁止清单以外的 `plugins/ssh/src/engine/**`、对应测试、`tests/e2e/ssh/**`。HTML/CSS/客户端 TS 先执行 zh-modern-web-guidance 的 search 与 retrieve；桌面能力经 `window.huhuHost`，Web 按 Baseline Widely available。禁止改其他插件、Kernel dispatcher/server/MCP/contracts 调用身份、Vault 包收集器、根锁文件。回环 SSH 夹具，不连真实主机、不用真实凭据。不 push，不启动子 agent。

## 产物

链式候选提交（临时索引，父 `82f0d188`），每组一批，报告逐批追加 SHA 与逐切片分类，不逐批停下；全部完成或上下文超过 80% 时发布 `report01.md` 终稿（格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`，单列「未运行的验证」与「需 Lead 接线」）、打印路径并停下。证据新建 `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H-remaining-linux.md`。
