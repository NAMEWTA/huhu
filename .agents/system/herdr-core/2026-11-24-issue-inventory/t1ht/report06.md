# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task06.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task06.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report06.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{022-aw0,038-aw1}.md 及各 UX 票同名文件
- 执行结果 — done，交 Lead 转交用户确认

## 成果与运行指针

分支 `inv/w2` 从 `2af88fd6fc55a9cfd92280e60146b38b634139b7` 接续。以下产物从 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2/.agents/dev/changes/2026-11-24-issue-inventory/` 打开，合入后可在主检出相同相对路径打开。

### 工作台 #14 · 6e6a6453443fbf6a91b284651d4bdd0cc9c04b6e

- 入口 `prototype/workbench/index.html`，观察记录 `prototype-review-workbench.md`。目录 15 个文件，内容 SHA-256 `38fc421b99259162bc30a34ed29bf3cb335075caf836d841ae30bfd7391d209d`。
- 覆盖 UX01–UX10、UX12–UX19。知识库和日历在 `knowledge.js`；任务、捕获和邮件在 `workflow.js`；终端、Space 和启动器在 `workspace.js`；HTTP MCP、工具授权、同步、保险箱和主题在 `settings.js`；看板在 `dashboard.js`。UX11 由自动化中心原型承接。复用 Huhu 主题、外壳、Lucide 图标及确认过的 SSH 外壳基础样式。
- 工作台完成 13 条本地文件旅程，包括文档失败与未知保存、原始内容的任务/笔记转换、嵌套 Esc、窄栏分级返回、分栏末行位置、HTTPS/端口设置入口、按对象工具授权、保险箱隐私与编辑、主题宽窄重排、键盘与鼠标看板操作。PTY 尺寸为可见容器的预览估算。跨文件跳转使用固定样例的 planId，一处修改后逐页同步的设计在自动化原型内的来源页演练。

### AW0 #16 · 842a1099ba5a2497b51acd8b0b45aac3a542b17e

- 基线与逐文件复用矩阵写入 `prototype-review-automations.md` 的 AW0 节。Huhu 本轮读取 `2af88fd6fc55a9cfd92280e60146b38b634139b7`，已具备 PlanAPI/HostUI 类型、旧规则与运行入口、手动运行意图及未知结果的核对。统一目录真实数据、来源迁移和运行关联仍需后续切片。记录了 U0 已知运行环境和原图 18–20 尚缺的安装包、尺寸与缩放信息。
- Orca 固定 `484454c17ec4c69e293fcda47f3a55d9fe5d49a3`，根许可证 Lovecast Inc. MIT。在 `temp/sources/orca` 核对列表行、详情、草稿、排期与模板、运行定位。`AutomationSchedulePicker.tsx` 的部分克隆 blob 通过 GitHub 固定提交下载，Git 对象 ID 核对为 `66042ff9599aa14b750fce17c66287b52d6e5884`。
- T3 Code 固定 `d1a6c35f7382beead7fb3125e530baf50a60786d`，根许可证 T3 Tools Inc. MIT。获取到 `temp/sources/t3code` 并固定到 `refs/huhu-research/issue16`。核对 ScheduledTask 的排期合同、目标编辑、调度服务；Labs Workflows 独立。原型学习目标与运行层级，采用 Huhu 动作、权限边界和主题。候选落点为 `AutomationsModule.tsx`、`RuleEditor.tsx`、`RunsPanel.tsx`；旧激活页、无身份跳转与私有 DTO 消费按实施阶段替换。未引入上游代码、品牌、独立调度器、数据库或运行时。

### AW1 #16 · 4b0c15aa00e7fcf328000e3a0f0b1f2aca3431b2

- 入口 `prototype/automations/index.html`，走查记录 `prototype-review-automations.md`。目录 12 个文件，内容 SHA-256 `96b22cdaa663016ae351a006be8e46fbb936a85c17489b52059f6debf3018775`。
- 中心、运行和来源在 `prototype.js`，计划编辑和预览在 `editor.js`，提供 PlanAPI 字段形状、来源与执行样本的 `fixtures.js`。同一 planId/revision 在中心和来源往返，原发生与子运行、效果各自可定位。覆盖 AU01–AU20 的可见部分。生产成本、历史迁移、真实调度和权限留给实施验收。
- 自动化完成 7 条本地文件旅程，包括草稿与版本冲突、简单/高级及 DST、未知保存与手动运行核实、受理与领域执行/效果区分、来源双向状态、删除后重读、只读和其他设备归属。用仓库实际 schema 核对 14 个 PlanSummary、6 个 PlanOccurrence、14 个改期输入、1 个 TaskActivity 与 4 个 HostDateField 样例。

### 验证与证据

- 在 Linux 上用 Playwright 1.65.0 / Chromium 158.0.8127.18 依次打开两个离线 `file:` 地址。测试矩阵为 1440 × 1000 浅色、390 × 844 深色，补测 700 × 844 外壳。20 条旅程通过，未发现横向溢出、非本地请求、资源失败或脚本异常。
- 命令 `volta run --node 24.22.1 node /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task06/walkthrough.cjs`。复查两个目录的 `fingerprint.mjs --expect` 均匹配。脚本、最终 JSON、日志、schema 校验及逐资源摘要在 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task06/`。

## 阻碍与接续

- 两份走查记录的「用户确认」留空。由 Lead 交付对应入口和固定指纹，请用户按场景确认。
- 本批改动只涉及确认原型与走查记录。没有生产代码、定向单测、新增项目 E2E、构建、类型检查或打包项目。真实验收继续使用已有 `tests/e2e/workflows/workbench-baseline.spec.ts`、`tests/e2e/workflows/task-journey.spec.ts`、`tests/e2e/workflows/automation-linux-environment.spec.ts`、`tests/e2e/workflows/automation-linux-approval-revoke.spec.ts` 及相应票据的场景。真实邮件、Vault 磁盘、系统输入法、PTY、MCP 监听与安全行为没有在原型中验证。

## Lead 验收

