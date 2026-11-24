# task01.md：保真黄金样本（H01）、会话 / 评论 / 资源 / 查看器验收缺口补证与 E04 偶发失败定因

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pC
- 当前任务：task01.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report01.md
- 工作目录：/home/wta/projects/huhu-wt-session（分支 closeout/issue2-session，基于 main 9f870c0，已 pnpm install）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pC
- 接续依据：无（首个任务）

## 目标与输入

Issue #2 验收原文见 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/source-issue-2.md §14，规格 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md（§5.1 修订、§5.2 G/H）。归档证据里以下项登记为“未做 / 未验证”，你要在**真实应用入口**（Playwright Electron e2e，涉及保存的必须关闭后重新打开再断言磁盘与渲染）或适当的单测里补齐证据；发现真实缺陷就修并加回归：

1. **H01**：`LocalDocProvider` 契约——对 OK 的 22 个黄金样本（上游 /home/wta/projects/huhu/temp/sources/open-knowledge 里的 golden / fixtures 样本，以实际位置为准，约 7.5 MB）与 Huhu 的 frontmatter 样本，hydrate → serialize 与原文字节相等，或在登记的“规范化”例外内且 `markdownSemanticallyUnchanged` 判为无变化；无编辑打开 / 关闭不调用 `notes.save`；一次编辑只产生一次保存，回执不清除更新的 dirty。另：`replaceRawBody`（外部写回 / FILE_WATCHER_ORIGIN）不进撤销栈（B05 修订）。背景：.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/spikes/sp-4.md、sp-6.md。新增测试文件 `packages/editor/test/golden-roundtrip.test.ts`（及必要夹具目录 `packages/editor/test/fixtures/golden/`）与 e2e `tests/e2e/knowledge/session-*.spec.ts`。
2. **C05**：坏 YAML 在属性面板里显示诊断文案与原文修复入口（实际可用：点修复入口 → 进入源码修好 → 保存重开后属性恢复显示），不清空属性、不隐藏文件、不静默重写（磁盘字节不变直到用户修）。
3. **D01**：属性面板里的“属性评论”UI 层创建 → 进入同一 `Comments/` 真实存储，取消不留伪线程；重开后线程仍在。
4. **D06**：移动、回收站删除后恢复、档案视图打开同一笔记，评论不丢（e2e）；任务评论（`tasks.comments.*`）既有 e2e 重跑无回归（找出对应用例并运行）。
5. **A06**：文件树右键菜单的键盘操作（方向键、Enter、Escape、子菜单）与窗口边缘不溢出（右下角 / 底部节点右键）；行内更多按钮、右键、键盘目标一致。
6. **A07**：拖到文件树空白处移回根目录（归档里因 Playwright 命中不稳改用菜单验证；请再尝试用真实鼠标序列或 DataTransfer 事件驱动 pierre 树的空白区，并说明方法）；冲突 / 移动入自身 / 越界在 UI 中的反馈（不破坏文件）。
7. **F03**：PDF 受密码保护、损坏、> 10 MiB（经 `vault.readRange` 分段，单次 ≤ 4 MiB）、外部修改的样本有明确反馈、无空白假成功（`tests/e2e/workflows/viewers.spec.ts` 已有基础 PDF 用例，扩充之）。加密 PDF 样本可用 qpdf 或脚本生成，放夹具。
8. **E05**：档案附件（档案记录目录里的 .pdf / .html / 图片）从档案视图打开时走统一 `FileViewer` 分派（不是独立查看器），双链 / `@` / 反链指向真实文件路径。
9. **E04 偶发失败定因**：`tests/e2e/workflows/archives-tabs.spec.ts` 的 E04 用例（约 136 行）在全量运行中失败过一次（“电话”字段改动 5 s 内未落盘，同时 Markdown 未保存编辑在途），单独重跑通过——疑似保存竞态。请在负载下（如同时跑 `stress` 或并行 2–3 个 e2e）重复运行 ≥ 20 次，统计失败率；若复现，查明是测试节奏还是 Markdown 草稿 flush 与档案字段保存的竞态（规格 C04：两种修改最终都保存到同一文件、不互相覆盖），是产品缺陷就修并给回归用例。

规格与现有实现：会话与保存在 `plugins/notes/src`（DocumentSession 等），资源与文件树适配在 `packages/editor/src` 下的 host / explorer（以实际位置为准），查看器 `FileViewer`，评论 `plugins/notes/src/engine/comments/`。项目背景：/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/design.md、.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/s4/verification.md、s5/verification.md、s6/verification.md、s7/sp-7.md。涉及前端代码时遵循 /home/wta/projects/huhu-wt-session/AGENTS.md（先按 .agents/skills/zh-modern-web-guidance/SKILL.md 的 search / retrieve 流程核对）。

## 读写范围与产物

- 可读范围：整个仓库、/home/wta/projects/huhu/temp/sources、归档目录 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity。
- 可写业务范围（仅在 /home/wta/projects/huhu-wt-session 内）：`plugins/notes/src/engine/**`、`plugins/notes/src/ui/` 下的会话 / 评论 / 属性 / 档案 / 查看器 / 文件树组件（**不改** `notes.css` 中工具栏与详情面板布局，属 w4:pB），`plugins/notes/test/**`、`packages/vault/**`、`packages/workbench/**` 中仅修缺陷所需、`packages/editor/test/golden-roundtrip.test.ts` 与 `packages/editor/test/fixtures/golden/**`（新增）、`tests/e2e/workflows/**`、`tests/e2e/knowledge/session-*.spec.ts` / `comments-*.spec.ts` / `explorer-*.spec.ts`（新增）、`tests/fixtures/**`、`.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/session/**`（新建）。
- 不得改动：`packages/editor/src/**`（含 vendor，属 w4:pA；若发现编辑器内核缺陷，写清复现与根因证据交 Lead，不自行修）、`packages/editor/test/` 下其它文件与 vitest 配置、样式与 i18n（属 w4:pB）、归档目录；不要 push / merge / 改 main。
- 预期产物：
  1. 提交到 closeout/issue2-session（中文 conventional 提交消息，结尾 `Co-Authored-By: Codex <noreply@openai.com>`）。
  2. `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/session/` 下：`gaps.md`（上面 9 项逐项：验收要求 / 做了什么 / 测试文件:用例名 / 结果 / 发现与修复的缺陷 / 仍有的限制）、`e04-flake.md`（运行次数、负载方法、失败率、结论）、`runs.md`（全部命令、退出码、计数、失败 / 重跑如实记录）。

## 验收与验证

- 9 项逐项有可复查证据；不能达成的写明原因与证据，不得以“已有单测”含糊替代 UI 层要求。
- 在 /home/wta/projects/huhu-wt-session 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows`。全部通过才算 done；偶发失败单独重跑 3 次并如实记录（注意：本机同时有另外两个 worktree 在跑 e2e，负载导致的 `electron.launch` 偶发失败要标明）。
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
