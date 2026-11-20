# task04.md：补上 OK 应用壳挂载的编辑器浮层（先做表情选择器），并排查同类遗漏

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pA
- 当前任务：task04.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task04.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report04.md
- 工作目录：/home/wta/projects/huhu-wt-parity（分支 closeout/issue2-parity，接着 c80391c）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pA
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report03.md（含 Lead 验收）

## 目标与输入

1. **表情**：`/` 菜单的“表情”命令派发 `ok:emoji-picker-open`（vendor `app/src/editor/slash-command/emoji-picker-event.ts`），但 Huhu 中没有组件接收这个事件。OK 的做法是在 `/home/wta/projects/huhu/temp/sources/open-knowledge/packages/app/src/components/EditorPane.tsx:1400` 挂载 `<EmojiInsertPopover />`（`editor/components/EmojiInsertPopover.tsx`，依赖 `components/emoji-picker.tsx` 等）。按依赖闭包把它复制进 vendor（固定 SHA 44a2e0a，新增文件登记 PATCHES.md / 闭包清单的约定以现有做法为准；如需新 npm 依赖，版本钉在上游锁文件），在 Huhu 的富文本编辑器挂载点（`packages/editor/src/rich/` 中合适的位置，例如 OkRoot 或 RichMarkdownEditor 内，只在编辑区作用域内）挂载，并迁入上游的 `EmojiInsertPopover.dom.test.tsx`。验收方式：真实 Electron e2e，从 `/` 选“表情”，选择器出现，用键盘和鼠标各选一个表情插入到光标处，保存、关闭、重开后回读磁盘与渲染；Esc 关闭后不留浮层，焦点回到编辑器。表情选择器要离线可用，不发网络请求（断言网络请求数为 0）。
2. **同类排查**：通读 OK `EditorPane.tsx`（以及 OK 编辑器宿主组件中挂载编辑器相关浮层或监听全局 `ok:*` 事件的地方），列出所有“由应用壳挂载、由编辑器内命令 / 事件触发”的组件和监听器（例如查找替换、代码预览编辑弹窗、链接编辑、图片 / 文件选择、提示 toast、属性面板入口等）。逐个核对 Huhu 是否挂载或有等价实现：已挂载的，写明证据（已有用例）；缺失、且属于本地编辑功能的，按上面相同方式补齐并加 e2e；只服务于 OK 云 / AI / 账户 / 应用壳的，写明不适用的理由。结果写进 `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/shell-mounts.md`，并同步 parity-82.md 中相关行的结论（例如第 124 行 EmojiInsertPopover）。
3. 把斜杠菜单逐项用例里“表情”项的断言改成：选择器真实出现并能插入。

涉及前端时遵循 AGENTS.md（先走 zh-modern-web-guidance 的 search / retrieve 流程；弹出层、焦点、键盘操作要符合指南）。

## 读写范围与产物

- 可写业务范围：同 task02（packages/editor/**、tests/e2e/knowledge/editor-parity-* / fidelity-* / editor-s3-matrix.spec.ts、tests/e2e/helpers/**（只增）、evidence/parity/**、pnpm-lock.yaml 与 packages/editor/package.json，仅在需要新依赖时）。不改 `packages/editor/src/rich/compact.tsx`、`rich.d.ts` 的 onPort 部分，以及 RichMarkdownEditor 的结算 / flush 逻辑（这些已由 w4:pC 修改并集成）。
- 预期产物：在分支上提交；shell-mounts.md、runs.md、parity-82.md 同步更新。

## 验收与验证

- 表情插入的 e2e（含保存、关闭、重开）在四路并行负载下 ≥ 10 次通过；同类排查清单完整，每项有结论。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`pnpm notices`、`xvfb-run -a pnpm e2e tests/e2e/knowledge`。全部通过才算 done。

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
