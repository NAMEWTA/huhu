# task02.md：复刻矩阵剩余 10 行 + Embed 行的收口，斜杠菜单偶发失败定因，完整知识库 E2E 复跑

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pA
- 当前任务：task02.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task02.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report02.md
- 工作目录：/home/wta/projects/huhu-wt-parity（分支 closeout/issue2-parity，接着 8298d28 继续）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pA
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task01.md、/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report01.md（含 Lead 验收）、/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/parity-82.md

## 目标与输入

1. 剩余行 126（描述符占位）、131（基础 UI 原语）、142（图片对齐）、143（文件块下载）、147（编辑器工具栏）、149（面包屑）、225（格式快捷键）、233（资源上下文菜单）、235（标签页右键）、238（侧栏拖放），以及第 115 行（外部 Embed 被 CSP 拒绝），每行给出最终结论。判定口径（Lead 规定）：
   - 属于编辑区内的本地编辑行为（126、131、142、143、225，以及 Embed 块本身的插入 / 编辑 / 保存）：必须在真实 Electron 中验证，涉及内容的要保存、关闭、重开后再断言。有缺陷就修（vendor 修改登记 PATCHES.md）。
   - OK 应用壳的能力已按归档设计被 Huhu 自有组件取代（147 工具栏、149 面包屑、233 原生资源菜单、235 标签页、238 侧栏拖放）：先在 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/design.md / decisions.md 里找到取代依据（如 DocTab、Huhu 笔记工具栏、DOM 右键菜单），再在真实 Electron 里验证 Huhu 等价物提供了该行的**用户可见能力**（例如 147 的属性按钮 / 模式切换入口、149 的路径展示、233 文件树右键菜单（可引用 w4:pC 的 `tests/e2e/knowledge/explorer-keyboard.spec.ts`，但要在本分支能找到证据或自己补用例）、235 标签页的关闭 / 切换操作入口、238 侧栏 / 外部文件拖入编辑区）。写明“由 Huhu X 取代，依据 design §y，验证用例 z”。取代后确实缺失的用户能力，记为缺口并说明。只有服务于 OK 云 / AI / 账户 / 应用壳、且 Huhu 没有对应概念的，才可判为不适用。
   - 第 115 行 Embed：Q3 / OP-D19 已定为默认不联网。要验证外部 Embed 块在 Huhu 中给出明确、可理解的“已阻止 / 外部内容未加载”状态（不是空白或报错），源 Markdown 保真不丢。如果现在只是空白，就修成明确提示（优先复用上游的 PreviewBlockedNotice）。
   工具栏 / 布局 / CSS 归 w4:pB，本任务对这些只加测试、不改实现；需要改实现时写进报告，交给 Lead。
2. 斜杠菜单偶发失败：在负载下（`stress -c 4` 或并行 e2e）重复 ≥ 20 次，查明根因（插入代码块后的复位与焦点、菜单列表缺失）。是产品缺陷就修并加回归；是测试节奏问题就按真实用户节奏修正测试，并说明依据。
3. 在最终提交上完整运行 `xvfb-run -a pnpm e2e tests/e2e/knowledge`，以及 typecheck / lint / test / test:vendor / ok-patches --check / build / format:check / knip，全部记录在 `/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/runs.md`；同步更新 `/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/parity-82.md`，使 82 行全部为“已验证 / 由 Huhu 等价物取代且已验证 / 有效不适用”，没有待验收项。

## 读写范围与产物

- 可写业务范围：同 task01（packages/editor/**、tests/e2e/knowledge/editor-parity-*、fidelity-*、tests/e2e/helpers/**（只增）、plugins/notes/src 中编辑器装配，仅用于修缺陷）、`/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/**`。**不改** `packages/editor/src/rich/RichMarkdownEditor*` 与 PM→Markdown 桥的推迟结算 / settleNow 逻辑（w4:pD 正在分析，相关结论另行派发），不改 notes.css 与工具栏布局实现。
- 预期产物：在 closeout/issue2-parity 上提交，更新 parity-82.md 与 runs.md。

## 验收与验证

- 82 行没有待验收项；每行的结论与证据可复查。
- 完整知识库 E2E 与各项门禁在最终提交上通过；偶发失败单独重跑 3 次并如实记录。

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
