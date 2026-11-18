# `rc4` 视觉基线与当前 HEAD 对比（SP-2 断言 / S0 缺项，2026-11-18）

## 基线

| 项 | 值 |
| --- | --- |
| 命令 | `node scripts/visual.mjs baseline rc4 --themes claude,apple,notion,vercel --no-build`（等价 `pnpm visual:baseline rc4`，四主题 × 亮 / 暗） |
| 被测提交 | `9132640`（`v0.0.1-rc.4`，独立 worktree 里 `pnpm build` 后运行） |
| 开始时间 | 2026-11-18T00:41:58+08:00，耗时 15 m 45 s |
| 产物 | `.visual/rc4/`（不进 git）：**264 张截图**（33 个屏幕 × 8 个主题组合）+ `css-coverage.json` + `runtime-styles.json` |

## 对比

| 项 | 值 |
| --- | --- |
| 命令 | `node scripts/visual.mjs compare rc4 --themes claude,apple,notion,vercel`（先 `pnpm build`） |
| 被测提交 | `d538e94`（feat/knowledge-ok-parity 之上的 S3 收尾分支，S0–S7 已合并），2026-11-18T01:00:11+08:00 开始，耗时 15.3 m |
| 结果 | `visual.spec.ts`（截图）与 `widths.spec.ts`（宽度矩阵 / compact / 减少动效的计算样式）**都失败**；`runtime-styles`、`coverage` 通过 |
| 截图差异 | 264 张里 **72 张不同（9 个屏幕 × 8），192 张逐像素一致** |

## 有差异的 9 个屏幕与原因

| 屏幕 | 类别 | 原因（来自计算样式差异与代码） | 是否预期 |
| --- | --- | --- | --- |
| `note-editor`、`note-reading`、`m-知识库` | 知识库 | 编辑器、阅读视图、文件树换成 OK 的实现 | 预期（本 change 的目标） |
| `archives-categories`、`archives-type`、`archives-detail` | 知识库 | S6 档案做成标签页，侧栏与分区条改版 | 预期 |
| `task-new-dialog`、`task-detail` | **非知识库** | S2c：任务描述改用 OK `compact` 变体（`task-detail` 里描述区高度 90 px → 210 px） | 预期（S2c 计划内），但**违反“非知识库屏幕 0 差异”的字面断言** |
| `settings-about` | **非知识库** | 关于页里内嵌的第三方许可证文本（`<pre>`）从 21346 px 增到 33898 px 高：S2a 引入 115 个新依赖，`THIRD_PARTY_NOTICES.md` 变长 | 预期，文本内容变化，不是样式回归 |
| `m-能力网关` | **非知识库** | 能力表高度 8461 → 8584 px：`vault.tree` 更名为 `vault.indexEntries` 后表格行文字更长 | 预期，文本内容变化 |

结论：**SP-2 的“非知识库屏幕 0 差异”没有字面成立**——4 个非知识库屏幕（`task-new-dialog`、`task-detail`、`settings-about`、`m-能力网关`）有差异，但差异都来自计划内的功能 / 文本变化，**没有发现 Tailwind / `.ok-root` 向 Huhu 其它界面泄漏的证据**：其余 24 个屏幕（含所有设置页、工作台、健康中心、插件中心、收件箱、版本历史、远程连接、Agent CLI、保险箱、自动化、命令面板、任务看板 / 日历 / 列表）四个主题 × 亮暗 **逐像素一致**。

## 没做 / 限制

- 没有对 `task-*` 的差异做“仅编辑器区域”的遮罩比对，所以不能证明任务详情里**编辑器之外**的像素不变；上述结论依据是计算样式差异只落在描述区（`aside:2/div:1/div:4`）。
- `::placeholder.border-*-color: rgb(20,20,19) → oklch(0.145 0 0)` 出现在知识库与任务描述区（OK 的 shadcn 变量未经 `token-map.css` 转成 Huhu 颜色）。这是 `.ok-root` 内的值，不外泄；是否要把 `oklch(0.145 0 0)` 映射成 Huhu 的 `--fg` 属于 S3 的主题对齐待办，**未处理**。
- 未做 Windows / macOS 实机比对。
