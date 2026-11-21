# task01.md：顶部工具栏遮挡（F07）、主题 token 映射（F08）、zh-Hans 未翻译扫描（H03）、体积与启动预算（G07）

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pB
- 当前任务：task01.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report01.md
- 工作目录：/home/wta/projects/huhu-wt-layout（分支 closeout/issue2-layout，基于 main 9f870c0，已 pnpm install）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pB
- 接续依据：无（首个任务）

## 目标与输入

Issue #2 验收原文见 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/source-issue-2.md §14，规格 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md（§5.2 G/H）。归档时仍未关闭、属于本任务的四项：

1. **F07 行为缺陷**：窗口宽度 < 1440 px 打开详情面板后，详情面板（覆盖在文档右侧的浮层，见 `plugins/notes/src/ui/notes.css` 约 1222 行的 `@media (min-width: 1440px)`）盖住笔记顶部工具栏最右的按钮（“添加批注”“笔记操作”），用户必须先关闭面板（证据：/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/s8/verification.md “本次发现并处理的问题”第 3 条）。F07 要求：长中文标题、侧栏 / 详情 / 评论展开、多标签、窄窗口及 125% / 150% / 200% 缩放下，工具栏合理收纳；不存在第一行大片闲置却强制第二行的布局。修复使工具栏在这些组合下所有按钮都可见、可点（不被遮挡；收纳进溢出菜单也算可达），并保持单行自适应（已有单行自适应工具栏，见 `tests/e2e/knowledge/editor-s3-toolbar.spec.ts`）。新增 / 扩充真实 Electron e2e：宽度 800 / 1024 / 1280 / 1439 / 1440 / 1920 × 详情面板开 / 关 × 评论面板开 / 关 × 缩放 100 / 125 / 150 / 200%，用 `document.elementFromPoint` 断言每个可见工具栏按钮的中心命中自身，并实际点击“添加批注”“笔记操作”验证可用。
2. **F08 主题一致**：OK 的 shadcn 变量未全部经 `token-map.css`（packages/editor/src/rich 下，以实际位置为准）映射到 Huhu 主题，例如 `::placeholder` 的 `border-*-color` 为 `oklch(0.145 0 0)`（证据：/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/visual-compare-rc4.md “没做 / 限制”）。核对 `.ok-root` 内所有 shadcn / OK 颜色变量，映射到 Huhu 语义 token，使四套主题（claude / apple / notion / vercel）× 亮 / 暗下编辑器、评论、文件树、属性面板不出现硬编码中性色；compact、reduced-motion 不回退；`tests/e2e/a11y.spec.ts` 通过。给出计算样式证据（脚本扫描 .ok-root 下元素的颜色计算值，不在当前主题 token 集合里的列出并解释）。
3. **H03 zh-Hans**：在知识库的编辑器（含 `/` 菜单、气泡菜单、工具栏）、评论、文件树（含右键菜单）、属性面板各屏，界面语言为简体中文时，用扫描脚本检查**未翻译的英文 msgid** 为 0（或登记白名单：专有名词、代码、快捷键）；切换语言设置即时生效。扫描脚本放 `scripts/` 或 e2e 里，可重复运行。发现未翻译就补译（Lingui 目录在 vendor 内，以实际位置为准；对 vendor 的修改登记 `packages/editor/src/vendor/open-knowledge/PATCHES.md`，`node scripts/ok-patches.mjs --check` 通过）。
4. **G07 体积与启动**：记录（不设上限，按 Q9）：安装包 / 构建产物体积增量（对 rc.4 `9132640`）、编辑器 chunk 体积且确认**懒加载**（非知识库模块首屏不加载编辑器 chunk，用网络 / 模块加载记录证明）、首次打开笔记耗时 p50 / p95（≥20 次）、非知识库模块冷启动指标对 rc.4 无回退（若有现成 perf 用例 `tests/e2e/perf.spec.ts` / `pnpm bench` 就沿用）。rc.4 可用 `git worktree add /home/wta/projects/huhu-wt-rc4 v0.0.1-rc.4` 构建对照（只读用途，用完保留，告诉 Lead）。

涉及前端代码时遵循 /home/wta/projects/huhu-wt-layout/AGENTS.md：先按 .agents/skills/zh-modern-web-guidance/SKILL.md 的 search / retrieve 流程核对（容器查询、溢出菜单、锚点定位等），再实现；Electron 能力按桌面端捆绑的 Chromium 版本核对。设计系统规范：.agents/dev/notes/context/design-system.md（层序、前缀、守护脚本），`pnpm lint` 内的 CSS 守护必须通过。

## 读写范围与产物

- 可读范围：整个仓库、/home/wta/projects/huhu/temp/sources、归档目录 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity、/home/wta/projects/huhu/.visual（rc4 视觉基线，可只读引用）。
- 可写业务范围（仅在 /home/wta/projects/huhu-wt-layout 内）：`plugins/notes/src/ui/**`（布局 / 工具栏 / 详情面板相关，含 notes.css）、`packages/editor/src/rich/**` 中的 CSS 与 token 映射、vendor 内的 i18n 目录与 PATCHES.md、`packages/ui/**` 中仅为 token 映射必需的部分、`scripts/` 下新增扫描脚本、`tests/e2e/knowledge/layout-*.spec.ts` / `i18n-*.spec.ts` / `theme-*.spec.ts`（新增）、`tests/e2e/knowledge/editor-s3-toolbar.spec.ts`（扩充）、`.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/**`（新建）。设计系统规范如需更新也可改 `.agents/dev/notes/context/design-system.md`。
- 不得改动：vendor 编辑器逻辑代码（非 i18n / 非样式）、`packages/editor/test/**` 与 vitest 配置（属 w4:pA）、`tests/e2e/knowledge/editor-parity-*` / `fidelity-*`（属 w4:pA）、归档目录（只读）；不要 push / merge / 改 main。
- 预期产物：
  1. 提交到 closeout/issue2-layout 的代码与测试（中文 conventional 提交消息，结尾 `Co-Authored-By: Codex <noreply@openai.com>`）。
  2. `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/` 下：`f07-toolbar.md`（修改前复现证据 + 修复后矩阵结果 + 截图路径）、`f08-theme.md`（扫描结果）、`h03-i18n.md`（扫描命令、结果、白名单与理由）、`g07-budget.md`（数据、机器、样本、命令）、`runs.md`（全部命令、退出码、计数、失败 / 重跑如实记录）。截图可放同目录 `shots/`。

## 验收与验证

- F07：修复前在 1280 px + 详情面板开时复现遮挡（e2e 断言失败或截图），修复后矩阵全部通过。
- F08：扫描无未解释的非主题颜色；四主题亮暗截图（知识库编辑器屏）可供复查。
- H03：扫描结果 0 未翻译（白名单除外），语言切换即时生效有 e2e 断言。
- G07：数据齐全、懒加载有证据。
- 在 /home/wta/projects/huhu-wt-layout 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check`、`pnpm knip`，以及 `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/a11y.spec.ts`。全部通过才算 done；偶发失败单独重跑 3 次并如实记录。
- 无法完成的验证如实写“未执行 / 未通过”与原因，不得声称通过。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report01.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
