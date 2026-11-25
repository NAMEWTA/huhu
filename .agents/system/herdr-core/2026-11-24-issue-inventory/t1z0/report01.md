# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1z0
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1z0/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1z0/report01.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/111-rc.md
- 执行结果 — done，等待 Lead 按下表复验

## 成果与运行指针

- 票据 `111-rc.md`，分支 `inv/w1`，工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`。基线 `f69e2375`，独立提交 `a2e49877da4baa8ce73b80e7b1cafbdecad61dcb`（`fix(knowledge): repair RC editor and archive regressions (RC)`，`Refs: #15`）。提交后工作区干净。
- 产品文件共 3 个。文档全宽布局的正文两侧至少预留 36px，覆盖窄窗右栏展开时移到左边的批注按钮（`plugins/notes/src/ui/notes.css`）。宿主标题字体规则跳过 OK 根内的标题（`packages/ui/src/styles/base.css`）。根目录 Markdown 的增量保存会让档案详情查询失效，档案列表仍仅在档案路径变更时刷新（`packages/workbench/src/engine-client/query.ts`）。
- 回归单测修改 `packages/workbench/test/engine-client.test.ts`。其余改动为下表标记「改用例」的 10 个 Playwright spec。完整文件清单可用 `git show --stat a2e49877` 核对。
- 核对了 #15 快照 C8、§10–12、#13 F01–F05、#14 UX01–UX04 和现有 Huhu 实现。复用现有详情打开 helper、增量缓存刷新及同 spec 的大文档页内查询。对照 `temp/sources/open-knowledge` 的编辑器结构及反链入口，本轮使用 Huhu 已有的宿主与 Vault 查询路径。
- 基线失败证据位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/final/e2e-failures.txt` 及同目录 `e2e-failures/` 的 trace 和错误快照。运行日志位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1z0/task01/`。

### Lead 复验用例

| Spec | 用例名 | 引入点与修正 |
| --- | --- | --- |
| `tests/e2e/knowledge/comments-edge-rail.spec.ts` | D02：两条边缘按钮定位对应正文，可鼠标和键盘打开，窄窗详情开关时仍可点击 | 产品。UX01 `5d3d1d21` 缩了全宽正文两侧的最小留白，窄窗详情开启时左侧按钮最多占 6px + 28px。把最小留白提到 36px，沿用原用例的防覆盖及鼠标、键盘断言。 |
| `tests/e2e/knowledge/comments-persistence.spec.ts` | D01 / D06 属性评论取消不落盘，创建后重开、移动、回收站恢复均保留 | 改用例。UX03 `19932580` 采用详情栏属性入口，用例先打开「属性」再定位 title 的批注按钮。仍检查取消不落盘及原 ID 在移动和恢复后保留。 |
| `tests/e2e/knowledge/editor-parity-shell-mounts.spec.ts` | 源码模式的属性图标仍能使用离线表情并保存 | 改用例。UX03 `19932580` 之后源码与实时预览的属性共用详情栏入口。从源码模式打开详情后点击图标，检查控件值及真实磁盘。 |
| `tests/e2e/knowledge/editor-s3-large.spec.ts` | S3：5000 段文档在实时预览里输入后立刻切源码 / 切文件，最后一个字符不丢 | 改用例。RC 快照确认已输入前缀且仍显示「保存中」，未录到保存请求的具体阶段。沿用 `0d8340f9` 在相邻 1 MiB 样例的页内查询，直接定位首段，避免整份富文本的 Playwright 检查开销。源码挂载等待预算采用相邻用例的 60 秒，整例 120 秒。保留保存回执门槛和两次磁盘断言。尚待确认测试开销与保存时延各占多少。 |
| `tests/e2e/knowledge/editor-s3-parity.spec.ts` | B06：鼠标拖选（段内与跨段）与上下行光标，不错位、不反向、不原地不动 | 改用例。UX01 `5d3d1d21` 的默认全宽使段落盒的百分比坐标能落到无文字的行尾。基线 trace 前几次拖选通过，随后坐标继续右移时选区为空。段内、跨段、方向键的坐标取首行文字的实际 Range，并要求浏览器预言机选到非空文字。 |
| `tests/e2e/knowledge/editor-s3-parity.spec.ts` | C05：坏 YAML——面板逐字给出诊断，修复入口是源码模式，修好后诊断消失且落盘 | 改用例。UX03 `19932580` 下诊断节点由详情栏属性页挂载。修复前后都打开属性页再查诊断，保留原文、具体错误、落盘检查。 |
| `tests/e2e/knowledge/editor-s3-properties.spec.ts` | H04 页面图标和封面通过 Vault 媒体路径显示本地图片 | 改用例。UX03 `19932580` 下图标和封面控件随详情属性挂载。打开后仍断言 URL 编码和实际图像解码尺寸。 |
| `tests/e2e/knowledge/editor-s3-properties.spec.ts` | F02：Markdown、TXT 和 JSON 在显式转换前保留旧编码字节 | 改用例。基线在转换点击后的首次磁盘轮询收到 ENOENT。既有 `5c25b77b` 引入的 `replaceRecoverably` 先独占搬出处置前的系统目录项，再独占发布转换文件，外部读者能碰到路径暂时缺失。等待转换完才挂载的 UTF-8 编辑器出现，随后检查精确字节，预览前后的保真断言仍在。 |
| `tests/e2e/knowledge/journey.spec.ts` | 用户完整路径：全部真实文件 → 隐藏后仍可 @ → 编辑 / 插块 / 属性 / 评论 → 保存重开 → JSON·TXT·PDF·HTML → 档案标签 → 切回继续编辑 | 改用例。`db92ad12` 的最后一步用文档尾代替列表项尾；基线真实保存显示文字进入列表后的独立段落。现在点击目标项「条目甲」并按 End，仍比较完整预期文件。 |
| `tests/e2e/knowledge/session-persistence.spec.ts` | C05 坏 YAML 保留原文，使用源码入口修好并关闭重开后属性恢复 | 改用例。同 `19932580` 的属性挂载变化。分别在打开属性后验证坏 YAML 和修复后重开可见的字段。 |
| `tests/e2e/knowledge/theme-ok-tokens.spec.ts` | OP-D05：加载 OK 样式保持根变量，并在编辑器和浮层隔离控件重置 | 产品。`git blame` 将未限定范围的宿主标题字距追到 `c5558b0a`，`e14b4624` 已对 core.css 标题规则加 OK 隔离，base.css 的根标题仍导致探针实测 −0.34px。将同一隔离边界应用到 base.css，沿用原 2px 探针。 |
| `tests/e2e/shell.spec.ts` | 知识库：关闭自动保存后，未保存的编辑在“重命名”和“移到回收站”之前先落盘，不丢内容 | 改用例。F04 `a57733b2` 将载荷移到 `.huhu/trash/<id>/payload/entry`。用元数据的原始路径识别条目，再从真实新位置核对未保存编辑。 |
| `tests/e2e/shell.spec.ts` | 版本与同步：文件历史查看/恢复；Git 页初始化、暂存、提交 | 改用例。F14 `38b0e848` 在检查点前结清待记录的自动修订，因此有两条「编辑」和两条「命名版本」。分别断言并继续用命名版本完成恢复和 Git 操作。 |
| `tests/e2e/workflows/acceptance.spec.ts` | 版本历史：对比基准“与当前内容 / 与前一版”切换，标签与 +n −m 随之变化 | 改用例。同 `38b0e848`。最新命名版本的前一条是同内容的自动修订。选择较新的自动修订以覆盖 +2，选择最早的自动修订以覆盖无前一版。 |
| `tests/e2e/workflows/archives-tabs.spec.ts` | E04 同一 index.md 同一会话：Markdown 标签里的未保存编辑，不会被档案视图改字段覆盖；“以档案视图打开 / 以 Markdown 打开”互通 | 改用例。UX03 `19932580` 后正文表面不包含属性控件。磁盘已同时含正文和字段。返回 Markdown 后验证正文及右栏实际字段值 999。 |
| `tests/e2e/workflows/archives-tabs.spec.ts` | E05 档案附件使用统一查看器，笔记 @ 引用与档案反链使用真实相对路径 | 产品。F23 `8fc6ee87` 的增量保存刷新仅把 Archives/ 归到档案查询，档案详情缓存漏掉从外部笔记新增的反链。让 Markdown 保存刷新 `archives.read`，保持档案列表的窄范围。原 E2E 从持久 Wiki 链接走回真实附件。 |

### 已运行验证

以下命令都以 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm` 开头，按顺序串行运行。MemAvailable 启动前满足对应门槛，实际 cgroup 及逐级父组均无有限内存阈值，相关卷可用 141 GiB。

| pnpm 参数 | 结果 | 日志 |
| --- | --- | --- |
| `exec vitest run packages/workbench/test/engine-client.test.ts -t 'F23 正文保存按修订更新原位元信息'` | 修复前按预期失败，archiveDetail 的 isInvalidated 实际 false | `backlinks-red.log` |
| `exec vitest run packages/workbench/test/engine-client.test.ts` | 38 项通过，含档案详情失效且档案列表不失效的断言 | `backlinks-green.log` |
| `--workspace-concurrency=1 --filter "./vendor/*" run build:types` | 3 个 vendor 类型产出步骤退出码 0 | `vendor-types.log` |
| `--filter @huhu/workbench run typecheck` | 0 错误 | `workbench-typecheck.log` |
| `--filter @huhu/plugin-notes run typecheck` | 0 错误 | `notes-typecheck.log` |
| `--filter @huhu/ui run typecheck` | 0 错误 | `ui-typecheck.log` |
| `exec vitest run plugins/notes/test/service.test.ts` | 53 项通过，含旧编码转换、条件版本和回收站 | `notes-service.log` |

`git diff --check` 通过。核对了实际 Electron 44.9.1 捆绑 Chromium 152.0.7977.167。

### 未运行验证

本轮未运行上表 16 个 Playwright 用例、整套 E2E、视觉截图、构建、打包、全仓类型检查、全仓 lint 或 knip。真实 Linux Electron 和独立 Web 的 UI 效果由 Lead 在整合候选复验。

### Modern Web Guidance

- **`css`** 我用 `:where(:not(.ok-root *))` 限制宿主标题规则的范围，同时保持宿主默认规则的原有选择器特异性（“Use `:not()` instead of overrides to exclude irrelevant states/targets”）。

## 阻碍与接续

实现无阻碍。S3 的基线运行记录只有 UI 保存状态，没有保存请求时序。若定向复跑仍显示该症状，先留存保存请求和回执时序再定位传输或 UI 阻塞。其余用例按上表复验。本 worker 创建的验证终端已回收，保留 `inv/w1` 供 Lead 合入。

## Lead 验收
- Lead 2026-11-25：合入；进入第二轮最终全量（主检出）。
