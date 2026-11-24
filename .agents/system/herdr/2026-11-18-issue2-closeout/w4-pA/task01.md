# task01.md：复刻矩阵 82 行未验证项补证（B01）+ 局部编辑字节差异（H07）

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pA
- 当前任务：task01.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report01.md
- 工作目录：/home/wta/projects/huhu-wt-parity（分支 closeout/issue2-parity，基于 main 9f870c0，已 pnpm install）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pA
- 接续依据：无（首个任务）

## 目标与输入

Issue #2 的 B01 要求“上游本地功能矩阵逐项对应源码、Huhu 实现和测试”，完成定义要求复刻矩阵完成。归档复刻矩阵 .agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/parity-matrix.md（§18 汇总）283 行中 **82 行标“未逐项验证”**（`grep -n 未逐项验证` 可列出：§1 少见节点 / 保真，§2 辅助扩展，§3 块组件，§4 工具栏与气泡按钮，§6 粘贴来源 / 拖放 / 复制，§7 快捷键，§8 上下文菜单等）。你的任务是让这 82 行每一行都变成以下两种之一：

1. **已验证**：有在本工作目录真实运行并通过的测试作为证据（迁入的上游测试或新增 e2e / 单测），并写出测试文件:用例名；
2. **不适用**：仅当该行服务于 OK 的云协作 / AI / 账户 / OK 应用壳等 Huhu 范围外能力（判定口径见 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/decisions.md OP-D19 与 spec.md §8），写明理由。**“难测”不是不适用的理由**；本地编辑功能不得降为可选。

推荐方法（可按实际调整，记录取舍）：
- **迁入上游 app 的 jsdom dom 测试**：上游在 /home/wta/projects/huhu/temp/sources/open-knowledge/packages/app（`**/*.dom.test.ts(x)`、`tests/dom/jsdom-preload.ts`、test-support）。按现有 `packages/editor` 的 `pnpm test:vendor`（`vitest.vendor.config.ts`、`test/vendor-setup.ts`、`test/vendor-not-applicable.json`）三分类口径接入：被测模块在 vendor 闭包里的就迁入并让它通过（必要的适配登记进 `packages/editor/src/vendor/open-knowledge/PATCHES.md`，`node scripts/ok-patches.mjs --check` 必须通过）；被测模块不在闭包的登记不适用并给原因。
- **真实 Electron e2e**：对需要真实浏览器行为的行（块组件渲染与交互、气泡 / 工具栏按钮、表格句柄与拖拽重排、查找替换、`#` / `[[` / 链接路径候选、块拖拽手柄、复制 / 剪切 / 粘贴与 15 类来源识别（可用构造的剪贴板 HTML/MIME 驱动）、JSX 节点方向键 / Escape、Shift-Tab 焦点陷阱、末尾可写区、占位符、下划线 / 高亮 / 转义 / HTML 块 / 行内 JSX / 未知 MDX 保真），新增 `tests/e2e/knowledge/editor-parity-closeout.spec.ts`（可拆多个文件）。沿用现有夹具与写法：参考 `tests/e2e/knowledge/editor-s3-matrix.spec.ts`、`editor-s3-rules.spec.ts`、`editor-s3-menus.spec.ts`、`tests/e2e/helpers/`。涉及内容的场景必须**保存后关闭并重新打开**再断言（磁盘内容 + 渲染）。
- **H07（局部编辑只产生局部字节差异）**：在一篇含 frontmatter / 表格 / 列表 / 注释 / 引用定义的长文里只改一个字，保存后对磁盘字节做 diff，只含该处（登记的规范化例外如末尾换行除外）；首次编辑同样成立。用真实 Electron e2e 断言。若不成立，这是真实缺陷：定位原因并修复（优先上游已有机制，例如保留原文的增量序列化），修不了就在报告里给出根因证据与建议，不要放宽断言。
- 发现的真实缺陷就修（vendor 修改登记 PATCHES.md；Huhu 适配代码在 packages/editor/src/rich、plugins/notes 内），并加回归用例。

编辑器行为对照基准是 OK 上游源码（/home/wta/projects/huhu/temp/sources/open-knowledge，固定 SHA 44a2e0a），不是自行设计。项目背景：/home/wta/projects/huhu/.agents/dev/notes/context/knowledge-editor.md（如存在）与 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/design.md。涉及前端代码时遵循 /home/wta/projects/huhu-wt-parity/AGENTS.md（先按 .agents/skills/zh-modern-web-guidance/SKILL.md 的 search / retrieve 流程核对，再实现）。

## 读写范围与产物

- 可读范围：整个仓库、/home/wta/projects/huhu/temp/sources、归档目录 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity。
- 可写业务范围（仅在 /home/wta/projects/huhu-wt-parity 内）：`packages/editor/**`（含 vendor 与 PATCHES.md、vitest 配置、test/）、`tests/e2e/knowledge/editor-parity-*.spec.ts` 与 `tests/e2e/knowledge/fidelity-*.spec.ts`（新增）、`tests/e2e/helpers/**`（只增不改既有导出签名）、`plugins/notes/src/**` 中编辑器装配相关文件（仅修缺陷所需）、`packages/editor/package.json` 与根 `package.json` 的 devDependencies（如 jsdom 需要；锁文件随之更新）、`.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/**`（新建）。
- 不得改动：`plugins/notes/src/ui/notes.css` 与工具栏 / 详情面板布局（属 w4:pB）；`packages/editor/src/rich/**/*.css` 与 token 映射（属 w4:pB）；i18n 目录（属 w4:pB）；归档目录 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity（只读）；不要 push / merge / 改 main。
- 预期产物：
  1. 提交到分支 closeout/issue2-parity 的代码与测试（可多次提交，消息用中文 conventional 风格，结尾加 `Co-Authored-By: Codex <noreply@openai.com>`）。
  2. `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/parity-82.md`：82 行逐行表（矩阵行号 / 项名 / 新状态 已验证|不适用 / 证据：测试文件:用例名 或 不适用理由 / 发现并修复的缺陷）；以及迁入上游 dom 测试的三分类结果表（总数 / 原样通过 / 适配后通过 / 不适用及原因）。
  3. `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/runs.md`：实际运行的命令、退出码、通过 / 失败 / 跳过计数、失败与重跑如实记录。

## 验收与验证

- 82 行全部为“已验证”或“有效不适用”，没有“未逐项验证”。不适用行的理由符合 OP-D19 / spec §8 口径。
- 在 /home/wta/projects/huhu-wt-parity 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check`、`pnpm knip`，以及 e2e：`xvfb-run -a pnpm e2e tests/e2e/knowledge`（全部知识库 e2e，含你新增的）。全部通过才算 done；偶发失败需单独重跑 3 次并如实记录。
- e2e 必须是真实 Electron（项目 Playwright Electron 夹具），不用 jsdom 代替 B04/B06/B07 类结论。
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
