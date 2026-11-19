# task05.md：集成后的两处收尾——CodeBlockView 上游测试适配，以及通知区英文

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pB
- 当前任务：task05.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task05.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report05.md
- 工作目录：/home/wta/projects/huhu-wt-layout（分支 closeout/issue2-layout）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pB
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report04.md；/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report05.md（“H03 扫出编辑器通知区域的英文 Notifications alt+T”）

## 目标与输入

**开工前先同步**：`git merge --no-ff --no-edit closeout/issue2-integration`（集成分支 tip 190605a，已经含有四个分支的全部工作），然后再开始。

1. 集成后 `pnpm test:vendor` 有 1 项失败：`app/src/editor/extensions/CodeBlockView.dom.test.tsx` 的“CodeBlockView preview-CSP wiring”（w4:pA 迁入的上游用例）期望 iframe 的 src 匹配 `/assets\/preview-frame\.html$/`，但你在 a2145c3 里把内页改成了 `preview-frame.html?no-inline`，桌面端由隔离协议提供。按你的新机制适配这个测试：断言仍然要证明固定 CSP 与块内容已经发给预览页、并且没有 srcdoc，只修改与 URL 形态有关的部分，并登记为测试改动（PATCHES.md / ok-patches 的测试改动口径）。之后需要 `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --refresh-replay`，再用 `--replay` 校验零差异，刷新后的清单一起提交。
2. H03：编辑器通知区（toast / sonner 等）的可访问名称 `Notifications alt+T` 是英文，要随知识库编辑器语言设置显示中文 / 英文（中文例如“通知 alt+T”），并扩充 `i18n-zh-hans.spec.ts` 覆盖它；再跑一次全部中文扫描，白名单外结果为 0。

## 读写范围与产物

- 可写业务范围：与 task03 / task04 相同（包括 vendor i18n、预览相关、PATCHES.md、i18n e2e），另加 `app/src/editor/extensions/CodeBlockView.dom.test.tsx`、`.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/vendor-replay.*`（只通过脚本刷新）。
- 预期产物：在你的分支上提交；更新 evidence/layout/h03-i18n.md 与 runs.md。

## 验收与验证

- `pnpm test:vendor` 全部通过；`node scripts/ok-patches.mjs --check` 与 `--replay` 都通过；`xvfb-run -a pnpm e2e tests/e2e/knowledge/i18n-zh-hans.spec.ts tests/e2e/knowledge/preview-html.spec.ts` 通过；`pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`pnpm knip` 通过。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report05.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
