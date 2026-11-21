# task04.md：HTML 代码块 / 起始模板的预览 iframe 内页不渲染

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pB
- 当前任务：task04.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task04.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report04.md
- 工作目录：/home/wta/projects/huhu-wt-layout（分支 closeout/issue2-layout，接着 212f1cd）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pB
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report03.md（“当前集成构建缺少 iframe 内页资产”）；w4:pA 的 report02 也观察到“HTML 代码预览 iframe 未呈现”

## 目标与输入

在 OK 编辑器里，HTML 代码块与“起始模板”（starter）块的实时预览是一个 iframe（上游 `PreviewFrame`、`preview-iframe-header`、`preview-iframe-theme`、`preview-live-tokens`，矩阵第 93 行）。你观察到集成构建里缺少 iframe 的内页资产，所以内容渲染不出来。

1. 查明预览 iframe 的内页（srcdoc 或独立 HTML / 运行时脚本）在 OK 里是怎么提供的（Vite 入口、public 资源、`?url` 导入等），以及 Huhu 的 electron-vite 构建为什么没有产出或提供它；与 Huhu 已有的 `huhu-preview` 隔离协议（F05）是什么关系，安全约束不能放宽：iframe 没有 `allow-same-origin`，`connect-src 'none'`，不能拿到 Node 或工作台桥接。
2. 修复，使得在生产构建（`pnpm build` 后的真实 Electron）里，插入 HTML 代码块和每种 HTML 起始模板之后，预览 iframe 实际渲染出内容（断言 iframe 内文 / 截图非空白），修改源码后预览随之更新，保存、关闭、重开后预览仍然正常；外部请求数为 0。
3. 加 e2e，并确认 F04 / F05 的既有 viewers 用例不回退。

涉及前端时遵循 AGENTS.md（zh-modern-web-guidance：iframe 沙箱 / CSP / 安全相关指南）。

## 读写范围与产物

- 可写业务范围：vendor 中与预览 iframe 相关的文件（改动登记 PATCHES.md）、`packages/editor/src/rich/**`（仅资源提供 / 接线，不改选区与 flush）、`packages/editor/vite*` / `apps/desktop/electron.vite.config.*` / 主进程协议注册（仅为提供预览资源）、`tests/e2e/knowledge/preview-*.spec.ts`（新增）、evidence/layout/**。
- 预期产物：在你的分支上提交；新增 evidence/layout/html-preview.md，更新 runs.md。

## 验收与验证

- 生产构建里预览确实渲染，e2e 在负载下重复 5 次通过；F04 / F05 用例通过。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check`、`pnpm knip`，以及 `xvfb-run -a pnpm e2e tests/e2e/knowledge/preview-*.spec.ts tests/e2e/workflows/viewers.spec.ts`。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report04.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
