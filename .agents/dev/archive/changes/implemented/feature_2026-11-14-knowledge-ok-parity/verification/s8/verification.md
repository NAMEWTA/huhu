# S8 验证记录（清理 / 文档部分，2026-11-18）

分支 `worktree-agent-ac0cf1e67e421d277`（基于合并 S0–S7 的 `7fc42c4`）。**fork 不能派生 `audit` 子代理，以下全部是在本 worktree 直接运行的原始结果**，整合者需让 `audit` 对合并后的快照重跑。

## 门禁（最终提交上）
| 命令 | 结果 |
| --- | --- |
| `pnpm lint` | exit 0（oxlint、check-lint-rules、stylelint、check-ui-colors、check-css-layers（不分层白名单 1 个）、check-css-classes、check-css-ownership、check-css-duplicates） |
| `pnpm typecheck` | exit 0（23 个包 Done） |
| `pnpm test` | exit 0：78 个文件通过 / 2 跳过；827 用例通过 / 8 跳过。本 worktree 内 watcher 用例通过（未复现 inotify 耗尽） |
| `pnpm build` | exit 0 |
| `pnpm knip` | exit 0 |
| `pnpm test:vendor`（新增根脚本） | exit 0：168 文件通过；4210 用例通过 / 2 跳过 |
| `node scripts/ok-patches.mjs --check` | exit 0：改动 23｜测试改动 5｜删除 4｜新增 21｜登记 53｜未登记 0｜多余登记 0 |
| `pnpm notices`（`gen-notices`） | 通过（1425 个运行时依赖，无被 ALLOWED 拒绝的包） |

## e2e（真实 Electron，`xvfb-run`）
范围：`shell.spec.ts`、`workflows/`、`knowledge/`、`states.spec.ts`、`a11y.spec.ts`。全量一次：**116 passed / 5 skipped / 6 failed**；其后修了其中与本 change 相关的 2 项（见下）并重跑受影响文件全绿。其余 4 项失败**未在本 worktree 修**：
- `shell.spec.ts:306` ACC-KN-10（50 MiB 日志）：审计在基线 `5319058` 上同样失败（预存）。
- `shell.spec.ts:1976`（自动化终端命令）、`acceptance.spec.ts:675`（W-C 远程运维）、`:748`（Agent CLI 新建菜单）：依赖 herdr 二进制 / ssh，本环境未提供 `HUHU_HERDR_BIN`，**未验证**（S2b 报告称带二进制重跑通过，本次没有复核）。
- `archives-tabs.spec.ts:136`（E04）：全量运行中失败一次（`电话` 字段改动 5 s 内未落盘，Markdown 未保存编辑同时在途），单独与成组重跑均通过——**疑似保存竞态或负载 flake，未确认**。

## 本次发现并处理的问题
1. `mdast-util-gfm-task-list-item@2.0.1` 把任务项序列化为 `- [ ] [ ] x`——真实行为缺陷，依赖钉回上游版本（PATCHES.md P-D-01，ledger R-52）。
2. `Mod+S`（快捷键登记表有）随旧编辑器丢失——已在 `NoteDocument` 恢复，测试 / e2e 同步。
3. 合并后 e2e 残留旧选择器、详情面板（窗口 < 1440px 时是覆盖在文档右侧的浮层）盖住工具栏按钮、树节点未展开、预览 hash——均为测试修正（`comments-s4`、`archives-tabs`、`viewers`）。**产品侧观察**：窗口 < 1440px 打开详情面板后，工具栏最右边的按钮（添加批注、笔记操作）被面板盖住，需要先关闭面板——这是 rc.4 起的既有布局，未改。
4. 档案正文换成紧凑 OK 编辑器后，其滚动容器会溢出盖住下方按钮（`shell.spec.ts:579` 抓到）——容器加 `max-height` + `overflow:auto`，该用例与 `archives-tabs` 重跑全绿。
5. S2a 报告的 `test:vendor` 97.9% 是人工“不适用”口径；现改为全量三分类：238 个已评估文件 = 167 原样通过 + 1 适配后通过 + 70 不适用（被测模块 / 助手不在闭包，逐条原因见 `vendor-tests-na.json`）+ 0 失败，**适用文件通过率 100%（168/168）**。注意：不适用占 29%，且上游 85 个 jsdom dom 测试未迁入、不在分母里。

## 未完成（如实）
- 贯穿路径 e2e `tests/e2e/knowledge/journey.spec.ts`、`e2e:packaged`、`pnpm bench`（F09 只有 S3 的 perf.spec 数据）、`pnpm visual:compare rc4`（基线从未生成）、`pnpm format:check`、CI 三平台：**未做**。
- app 的 jsdom dom 测试（约 85 个）未迁入 `test:vendor`（需上游 `tests/dom/jsdom-preload.ts` 与 `test-support/`）。
- demo Vault 增加了 JSON / TXT 示例并改了欢迎页；`tests/visual` 里的知识库相关基线会变（预期变化），`AR-16` 用例未单独重跑确认。
- 真实输入法、Windows / macOS 实机：不能在本环境验证。
- 档案 / 其它模块里 `.agents/skills/` 的外部改动不是本 worktree 的事。
