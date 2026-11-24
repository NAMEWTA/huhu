# task03.md：审查发现修复——H03 完整中文与编辑器语言设置、标签页右键、安装包排除测试、G07 复测

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pB
- 当前任务：task03.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task03.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report03.md
- 工作目录：/home/wta/projects/huhu-wt-layout（分支 closeout/issue2-layout）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pB
- 接续依据：独立审查报告 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report01.md（必读，含文件:行、复现方法与 Lead 的分配）；你自己之前的报告

## 目标与输入

**开工前先同步**：在工作目录执行 `git merge --no-ff --no-edit closeout/issue2-integration`（集成分支是 main 加上 layout / session / parity 三个分支，tip 03dc93b 或更新），解决冲突后再开始，之后都在这个基础上提交。集成分支以后会再合并你的分支。

1. **H03 · 剩余英文**：插入后的 Embed 占位 `Embed a URL`、属性 / 删除按钮里的 `Embed`（`core/src/registry/built-ins.ts` 约 845–857 行、`app/src/editor/components/Embed.tsx` 约 23–32 行），以及所有插入块之后才出现的文案（命令结果、占位、属性面板、错误状态）。扩充 `i18n-zh-hans.spec.ts`：对 `/` 菜单中**每个块都实际插入一次**，再扫描它的占位 / 属性 / 错误状态；不要过滤中英混合的文本，改用实际的消息 ID，或登记过的专有名词白名单（比如 Mermaid、KaTeX、URL）。
2. **H03 · 语言设置（Lead 撤回之前的“不适用”判定）**：规格 §5.2 H03 要求“切换语言设置即时生效”。做一个最小但完整的实现：在 Huhu 设置里增加“知识库编辑器语言”（选项：简体中文（默认）、English），经现有设置契约存储（`packages/contracts` 的设置 schema 与设置页，以实际位置为准，沿用已有设置项的写法）；`NoteEditorSurface.tsx:116`、`ResourceTree.tsx:155`、`CommentsPanelSurface.tsx:31` 等固定写死 zh-Hans 的地方改为读取这项设置。切换后已打开的编辑器、评论、文件树、属性面板**即时**生效，不重开文件，也不丢失未保存的编辑。加 e2e：打开笔记、输入未保存内容、切到 English，断言界面文案变了且草稿还在；切回中文后扫描结果为 0。Huhu 自身界面的文案不在本项范围内。
3. **B01 第 235 行 · 标签页右键**：参照 OK 的 EditorTabs 标签右键菜单（/home/wta/projects/huhu/temp/sources/open-knowledge/packages/app/src 中定位），在 Huhu 的 `TabStrip` 上实现适用的菜单项（至少：关闭、关闭其他、关闭右侧、复制路径、在文件树中显示；只服务于 OK 云 / 分屏的项不做，并写明理由）。键盘可以唤出（Shift+F10 / ContextMenu 键），窗口边缘不溢出，有未保存修改时关闭要先 flush，不丢草稿。复用现有的 `NoteContextMenu` 组件 / 样式。加 e2e。
4. **工程 5 · 安装包带进了 vendor 测试**：`apps/desktop/electron-builder.yml` 约 8–11 行，把依赖目录里的测试源码、helper、test-utils 和非运行时夹具（含 vendor 已有的 perf 夹具）排除出 ASAR；用 `@electron/asar` 列出包内文件，加一个可以重复运行的断言脚本（例如 `scripts/check-asar-contents.mjs`），保证包里没有 `*.test.*`、`*.dom.test.*`、`test-utils`、`__fixtures__` 等。构建 linux-unpacked 时可以用 `-c.electronDist=<本 worktree 已安装的 Electron dist 的 realpath>`，避免重新下载。
5. **规格 6 · G07 复测**（等 1–4 完成、**机器空闲**之后做；先用 `uptime` 确认 1 分钟负载 < 2，否则等待，最多 30 分钟，并记录）：用同一宿主、低负载、交错配对的方式，rc.4 与你的最终提交各 ≥ 20 对，测工作台、收件箱、首次打开笔记的 p50 / p95；另外构建**同格式**的 Linux 安装包（AppImage 或 deb；两边格式一致），记录体积增量。如实写出结论，不要说没有证据支持的“无回退”。

## 读写范围与产物

- 可写业务范围：你 task01 / task02 的全部范围，**另加**：`packages/contracts` 中的设置 schema、设置页（Huhu 设置模块，以实际位置为准）、`plugins/notes/src/ui/tabs/**` 与 `TabStrip`、`plugins/notes/src/ui/explorer/ResourceTree.tsx` 与 `CommentsPanelSurface.tsx`（仅语言接线）、vendor 中的文案来源与 Lingui 目录（登记 PATCHES.md）、`apps/desktop/electron-builder.yml`、`scripts/check-asar-contents.mjs`（新增）。不改会话 / 保存 / archives（属 w4:pC），不改 RichMarkdownEditor 的选区逻辑（属 w4:pA）。
- 预期产物：在你的分支上提交；更新 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/` 下的 h03-i18n.md、g07-budget.md、runs.md，新增 tab-menu.md、asar-contents.md。

## 验收与验证

- 每条都有可以复查的证据。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`pnpm notices`、`xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/a11y.spec.ts`，以及 ASAR 内容检查。全部通过才算 done；偶发失败单独重跑 3 次并如实记录。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report03.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
