# task01.md：独立审查——Issue #2 收尾的交付候选版本

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pE
- 当前任务：task01.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report01.md
- 工作目录：/home/wta/projects/huhu-wt-review（detached HEAD = 03dc93b，即 closeout/issue2-integration；已 pnpm install，已放随包 herdr）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pE
- 接续依据：各实现报告（含 Lead 验收）：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report01.md、report02.md；/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report01.md、report02.md；/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report01.md、report02.md；疑难分析 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report01.md

## 目标与输入

审查 `git diff main..03dc93b`（main = 9f870c0），**包括所有新增文件**（`git diff --name-status main..HEAD | grep ^A`），判断它是否正确补齐了 Issue #2 的关闭缺口，且没有引入回归。

规格：Issue 验收 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/source-issue-2.md §14（A01–F10）；规格 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md §5（修订与 G/H）；已定决定 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/decisions.md OP-D19；Lead 台账 .agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/acceptance.md。证据在本工作目录 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/{parity,layout,session}/`。

两条轴（按 dev-review 的口径）：
1. **规格轴**：每项改动对应的验收要求是否真的满足；证据（测试用例）是否真的断言了要求的行为（例如涉及保存时是否关闭并重开后回读，而不是只读内存；“判红”的回归用例在修复前是否确实会失败）；矩阵 82 行中“由 Huhu 等价物取代”的 5 行、不适用判定、H03 的“即时切换语言不适用”、G07 的判定，依据是否站得住。
2. **工程轴**：正确性缺陷（竞态、异步 drainer 的错误处理与解除注册、重入、卸载后 setState、内存泄漏、懒加载拆分是否让路径漏掉 Suspense、i18n 别名是否破坏英文过滤）、安全（Embed 是否真的在建 iframe 前阻断、附件下载的路径守卫、`UnindexedFileViewer` 的路径参数）、性能（drainer 是否在热路径上同步序列化全文，F09）、vendor 修改是否全部登记 PATCHES.md、新增约 14 万行黄金样本夹具与 jsdom 测试是否合理（体积、许可证 / 来源声明、是否进入运行时包）、合并冲突的处理（`plugins/notes/src/ui/NotesModule.tsx`：Lead 把 `UnindexedFileViewer` 改成了 lazy + Suspense；`PATCHES.md` 两边的小节都保留了）。

可以运行任何只读检查与测试（`pnpm build` 产物、e2e 定向用例等）来证实或推翻怀疑；不要修改业务文件。

## 读写范围与产物

- 可读范围：整个仓库、/home/wta/projects/huhu/temp/sources、归档目录、各报告。
- 可写业务范围：无。测试运行产生的构建 / test-results 目录不算业务改动，但不得提交任何东西。
- 预期产物：报告里给出发现列表，每条写明：严重度（阻断 / 应修 / 建议）、文件:行、问题、影响、复现或证据、建议修法。另给出逐项结论：哪些验收项的证据你认为不成立。没有问题也要明确写“未发现阻断问题”，并列出实际检查过的内容。

## 验收与验证

- 每条“阻断 / 应修”的发现都要有证据（代码引用加推理，最好附实际运行结果）；推断要标明。
- 列出你实际运行过的命令和结果。

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
