# task02.md：H03 未翻译标签补齐与 G07 非知识库冷启动回退的定因与修复

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pB
- 当前任务：task02.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task02.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report02.md
- 工作目录：/home/wta/projects/huhu-wt-layout（分支 closeout/issue2-layout，接着 a842d06 继续）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pB
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task01.md、/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report01.md（含 Lead 验收），以及 /home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/h03-i18n.md、/home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/g07-budget.md

## 目标与输入

1. **H03**：把 report01 扫出的 28 个白名单外英文标签（文件树 1、气泡菜单 6、斜杠菜单 21）补成简体中文。**本任务授权修改** vendor 里绕过 Lingui 的文案来源（优先接入 Lingui 的 msgid 并补 zh-Hans 翻译，保持上游结构，改动登记 `packages/editor/src/vendor/open-knowledge/PATCHES.md`，`node scripts/ok-patches.mjs --check` 通过），以及文件树依赖的读屏名称（aria-label）。斜杠菜单的英文别名 / 搜索关键字可以保留，用于英文过滤，但显示名称要是中文。完成后重跑 `tests/e2e/knowledge/i18n-zh-hans.spec.ts`，白名单外结果必须为 0。**“切换语言设置即时生效”这一条 Lead 已判为不适用**（Huhu 没有界面语言设置），把这个判定写进 h03-i18n.md，并从 e2e 断言中去掉；不要新增语言设置。
2. **G07**：非知识库冷启动 p95 回退（工作台 1580.7 → 1803.2 ms，收件箱 p95 也偏高）。要求：
   - 定因：比较 rc.4 与候选版本**冷启动时实际加载的模块 / chunk 及其体积**（CDP Network / Performance 记录，或 Vite manifest + 启动时 `performance.getEntriesByType('resource')`），以及主进程 / 渲染进程启动阶段的耗时分解（ready-to-show、首个模块渲染）。重点排查：主入口 chunk 是否因 OK 依赖、Tailwind / Lingui、FileIcon、`@huhu/editor` 的共享导出、`NotesModule` 的预载等变大；被 eager import 的编辑器相关模块；启动时的知识库预载（"NotesModule 出现时预载编辑器块"）是否在非知识库首屏也触发；新增的 CSS（`.ok-root` 层）是否进了首屏 CSS。
   - 修复：把编辑器 / OK 相关的代码与样式移出非知识库首屏的关键路径（动态 import、拆分入口、延迟 CSS 等），不改变知识库内的功能与 F09 性能。
   - 复测：沿用 `scripts/measure-notes-startup.mjs` 的同一口径，rc.4（/home/wta/projects/huhu-wt-rc4）与修复后候选各 ≥ 20 对、交错运行、两轮，给出 p50 / p95 和差值；若剩余差值落在两轮间的噪声范围内（用 rc.4 自身两轮的差值衡量），如实写明。若不能消除，给出剩余开销的逐项归因（哪个模块多少 ms），供 Lead 判断。
   涉及前端改动时遵循 AGENTS.md（zh-modern-web-guidance 的 search / retrieve 流程）。

## 读写范围与产物

- 可读范围：整个仓库、/home/wta/projects/huhu/temp/sources、/home/wta/projects/huhu-wt-rc4。
- 可写业务范围（仅在 /home/wta/projects/huhu-wt-layout）：task01 的全部可写范围，**另加**：vendor 中的文案来源文件（仅用于 i18n）与 Lingui 目录；`packages/editor/src/index.ts` 等包入口与 `packages/editor/package.json` 的 exports（仅用于拆分懒加载）；`plugins/notes/src/**`、`apps/desktop/src/renderer/**`、`apps/desktop/electron.vite.config.*`、`packages/workbench/src/**` 中与启动加载路径相关的部分。不得改动 vendor 编辑器逻辑、`packages/editor/test/**`、`tests/e2e/knowledge/editor-parity-*` / `fidelity-*`、`packages/editor/src/rich/RichMarkdownEditor*` 与桥 / settle 逻辑（另有分析在进行）。
- 预期产物：在 closeout/issue2-layout 上提交；更新 `/home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/h03-i18n.md`、`/home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/g07-budget.md`、`/home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/runs.md`。

## 验收与验证

- H03：i18n 扫描白名单外结果为 0。
- G07：有定因证据和修复；复测数据齐全，判断有依据。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/a11y.spec.ts tests/e2e/perf.spec.ts`。全部通过才算 done；偶发失败单独重跑 3 次并如实记录。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report02.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
