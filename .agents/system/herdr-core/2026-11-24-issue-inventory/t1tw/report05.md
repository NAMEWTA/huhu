# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task05.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task05.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report05.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/ 下的 059-ux18.md、070-ux19.md、096-u7.md，由 Lead 回写
- 执行结果 — done，应用验收与固定候选仍待 Lead

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`。基线是已合入 UX15/UX17 回归的 `ecd91140f9eaf8ebc1707a3a0c14e81f419f7b5e`。三票各自提交，最终 HEAD `297a4f86cbdd757de1477a3426af8fab8a671f98`。工作树干净，`git diff ecd91140..HEAD --check` 和三份改动 spec 的 TypeScript 转译语法检查通过。定向单测及包级检查均以 Node 24.22.1 持共享验证锁运行，日志在 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task05/`。

UX18/UX19 沿用工作台原型已确认的首页状态，原型修订包指纹 `9f5db0cb02b2aaf035ab4d80177bb1411ebce2291dc84b8a3e23cdc8d8ed42bb`。入口 `prototype/workbench/dashboard.js` 中的 `showDashboard` 和 `addWidget` 及 `module.css`。参考本机 Homarr 的 `item-select-modal.tsx` 并复用仓库现有的 React Grid Layout、目录注册表和共享控件。未引入第三方源码，RGL 2.3.0 的来源和许可已在 `docs/upstream/ledger.md`。

### UX18 · 看板编辑

- 提交 — `de2e5de9fca035f9c9ccd3a6fd8c7b6992a9d9f6`。
- 改动文件 — `packages/workbench/src/home/{Dashboard.tsx,dashboard-layout.ts,dashboard.css}`、`packages/workbench/test/dashboard-layout.test.ts`、`tests/e2e/workflows/{workbench-baseline,acceptance,dashboard-appearance-package}.spec.ts`。
- 实现 — 卡内保留紧凑的移动手柄、显隐和设置。标题、插件配置、推荐尺寸、复制及移除从设置对话框进入。常驻宽高 select 与移动箭头已移除。桌面拖动和角落缩放沿用 RGL 与现有落点预览，角落命中区 24px。手柄方向键移动，Shift 加方向键缩放。窄容器上下键调整顺序，尺寸写回同一持久布局。键盘尺寸沿用定义的上下限和已有碰撞规则，状态区读出位置及尺寸。
- 验证 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/dashboard-layout.test.ts`，4/4。持同锁运行 `volta run --node 24.22.1 pnpm --filter @huhu/workbench run typecheck`，0 错误。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts`「UX18 看板相邻卡片拖缩与键盘调整，保存重开和取消保留布局」覆盖 Linux 与独立 Web。一起关注 `acceptance.spec.ts`「首页看板：宽屏拖动与缩放预览保持草稿，退出拖动恢复原位置」「首页看板：窄屏调整顺序时保留草稿，保存后在宽屏重开使用同一布局」与 `dashboard-appearance-package.spec.ts`「候选看板：四主题明暗、减少动效、放大与键盘移动保存」。

### UX19 · 添加卡片

- 提交 — `fe37f432db3f176614efa5b89bdd40df33a3f25d`。
- 改动文件 — `packages/workbench/src/home/{Dashboard.tsx,DashboardCatalog.tsx,HomeModule.tsx,dashboard.css}`、`tests/e2e/workflows/workbench-baseline.spec.ts`。
- 实现 — 复用原生对话框及共享 Select，将可信目录组织为自适应卡片。可搜索名称、用途及来源，筛选工作台或插件，查看推荐尺寸和实际添加状态。实例数量由原定义限制，恢复仅修改指定实例的 hidden 标记。即使插件停用，可信目录仍提供定义和原因，布局中的实例留在原处并显示占位。活动实例仍使用注册表可见组件。
- 验证 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/home-dashboard.test.ts`，3/3。持同锁运行 `volta run --node 24.22.1 pnpm --filter @huhu/workbench run typecheck`，0 错误。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts`「UX19 看板目录可按用途与来源搜索，区分单例、恢复、多实例和不可用来源」。用同一工作台入口验证两端，核对隐藏恢复的实例 ID、第二份任务卡 ID 及插件停用前后的已存布局。

### U7 · 候选证据索引与旧入口核对

- 提交 — `297a4f86cbdd757de1477a3426af8fab8a671f98`。
- 改动文件 — `apps/engine/test/endpoint-contract.test.ts`、`tests/e2e/workflows/acceptance.spec.ts`。
- 证据接线 — 在原 UX13 Gateway 应用用例中，从复制的真实配置提取当前 URL，以夹具凭据建立 HTTP MCP 会话，成功读取 Vault 标识后撤销令牌，同一会话再请求得到 HTTP 401。附件只保留已精确比对的带占位符配置与 HTTP 状态。Engine 定向用例另证明启用、重启后同端点重连、普通 CLI 重新发现、旧别名 404、旧 stdio 启用设置保持关闭、以及已连接会话撤销后的 401。
- 验证 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/endpoint-contract.test.ts`，4/4。持同锁运行 `volta run --node 24.22.1 pnpm --filter @huhu/engine run typecheck`，0 错误。
- Lead E2E — `tests/e2e/workflows/acceptance.spec.ts`「UX13 能力网关 MCP：保存本机端点、复制 HTTP 客户端配置、管理所属插件」。另参照 `tests/e2e/workflows/mcp-aggregation.spec.ts` 已有 UX14 和 P1–P4 的工具授权、已缓存工具撤权、Web 只读和本地上游传输证据。新 UI 附件名 `fixed-endpoint-client`。
- 旧入口 — `apps/cli/src/main.ts` 当前只有普通 CLI 入口，入站服务在 `packages/kernel/src/server/http-app.ts` 使用 `MCP_HTTP_PATH`，旧 `/api/v1/mcp` 已有拒绝断言；出站连接 stdio 属于 #12。Notes Engine 公开批注能力为 list、create、update、relocate、delete，旧 `resolved` 字段在迁移清理中使用，旧正文和作者时间保存在 `.huhu/comment-migrations/`。首页和系统退出配置继续经过 `useDashboard` 的原草稿/修订事务，专注继续走 Engine 的 `home.focus.*` 和自动化计划。

#### UX01–UX19 验收索引

现存证据取自同名票据的 `evidences/`。下表中的用例按仓库 `tests/e2e` 路径列出。历史通过的候选与本次 HEAD 不同。每条具体日志和版本仍以原验收文件为准。

| UX | 实际提交 | 用例入口及宿主记录 |
| --- | --- | --- |
| 01 | `5d3d1d21` | `workflows/workbench-knowledge.spec.ts` 混合 Markdown、三种模式和焦点，Linux 已测，独立 Web 同场景未见记录 |
| 02 | `a0820529`、`a26d6c3a` | `workflows/workbench-knowledge.spec.ts` 失败和未知保存、`knowledge/session-flush.spec.ts` 回归，Linux 已测；`workflows/workbench-baseline.spec.ts` U0 是双宿主失败样本，Web 的未知结果分支待测 |
| 03 | `19932580` | `workflows/workbench-knowledge.spec.ts` 右栏和批注旅程、`knowledge/comments-s4.spec.ts`，Linux 已测，独立 Web 同场景未见记录 |
| 04 | `14545113`、`a26d6c3a` | `workflows/workbench-knowledge.spec.ts` 常驻月历与唯一日记，Linux 已测，独立 Web 同场景未见记录 |
| 05 | `6ea1126f`、`dbe349f3`、`c0431d98` | `workflows/workbench-pages.spec.ts` 窄窗任务表单，Linux 已测；`workflows/workbench-baseline.spec.ts` U1 有 Web 表单样本，完整 Agent 选择旅程的 Web 记录待补 |
| 06 | `2ef2e901`、`74b2808d` | `workflows/workbench-pages.spec.ts` 快速捕获和待处理投影，Linux 已测；`workflows/workbench-baseline.spec.ts` U0/U1 有 Web 浮层样本，Web 核实原转换及待处理全程待补 |
| 07 | `6b802980` | `workflows/workbench-pages.spec.ts` 邮件三栏与设置，Linux 已测；`workflows/mail.spec.ts` 有 Web 附件入口，三栏完整 Web 验收未见记录 |
| 08 | `012ab2b8`、`cce1dd93` | `workflows/workbench-baseline.spec.ts` 实际 PTY 尺寸与末行，Linux 和独立 Web 已测，真实 Pi TUI 未测 |
| 09 | `e2b84a15` | `workflows/workbench-baseline.spec.ts` 全局会话行与 Space 树，Linux 和独立 Web 已测 |
| 10 | `df5e49d7`、`a15d4d33` | `workflows/workbench-baseline.spec.ts` 窄窗启动器及实际 argv，Linux 和独立 Web 已测，使用夹具 CLI |
| 11 | `180753d3` | `workflows/task-journey.spec.ts` T4.1/T5.5 和 `workflows/automation-center.spec.ts` AW2–AW5，Linux 与独立 Web 有覆盖 |
| 12 | `2f23371d`、`ecb02671` | `workflows/workbench-baseline.spec.ts` U1，Linux 和独立 Web 已测 |
| 13 | `da04886d`、本次 `297a4f86` | `workflows/acceptance.spec.ts` UX13 和 Engine 端点合同，Linux 工作台与独立 HTTP 客户端已有记录，新增应用附件待 Lead；Windows 实机按既定环境范围未运行 |
| 14 | `371a66f1`、`ff857edb` | `workflows/mcp-aggregation.spec.ts` 即时撤权与独立 Web 只读、`workflows/acceptance.spec.ts` 批量与版本冲突，Lead 已验 |
| 15 | `600e8b1f`、`11f9a09c` | `workflows/workbench-baseline.spec.ts` 同步重排与原计划，Linux 和独立 Web 已测 |
| 16 | `0279cacf` | `workflows/workbench-baseline.spec.ts` Safe 三栏与按账号取用，Linux 和独立 Web 已测 |
| 17 | `57ab5062`、`0fdcc492` | `workflows/workbench-baseline.spec.ts` 外观重排与重开，Linux 和独立 Web 已测 |
| 18 | `de2e5de9` | `workflows/workbench-baseline.spec.ts` 看板相邻卡和草稿，两端用例已写，待 Lead |
| 19 | `fe37f432` | `workflows/workbench-baseline.spec.ts` 看板目录和插件停用，两端用例已写，待 Lead |

## 阻碍与接续

实施无阻碍。桌面和独立 Web 应用 E2E、固定候选、Windows/macOS、真实 provider/外部服务、构建、打包、全仓 typecheck、全仓 lint、knip 和应用截图均未在 worker 运行。本回执保留了 U7 缺少完整独立 Web 同场景证据的项，供 Lead 与 RC/J/SIGN 对照。已回收本轮创建的全部验证终端。

## Lead 验收
- Lead 2026-11-25：合入 main；修正三个用例首参签名。E2E 17 通过 2 失败；U7 通过，UX18/UX19 返工派 task06。
