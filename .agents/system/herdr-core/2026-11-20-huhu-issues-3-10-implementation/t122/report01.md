# W02-05 看板恢复与损坏预览

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t122`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t122/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t122/report01.md`
- 执行结果 — `done`

## 候选与行为

- 候选提交 `95ecb232575813a0f8ccf665e79eec78dd03869d`，父提交 `2ceec67d9be1227da4815dc1df1afd8f1d8069c3`，分支 `impl/huhu-issues-3-10-dashboard-restore`。工作区 `D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore` 干净。候选只含私有 Kernel 实现与独立 Engine 测试。
- `defineDashboardRecovery` 提供 `home.dashboard.recovery.preview` 与 `home.dashboard.recovery.commit`。`restore` 接受现有 `home.dashboard.backup` 返回的完整当前格式板。恢复后保留实例 ID、类型、配置、显隐和几何，生成目标 Vault 的新 revision 和更新时间。 [恢复与快照](D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore/packages/kernel/src/capabilities/home-dashboard.ts:195)
- `repair` 按 y、x、instanceId 的稳定顺序判定占用。预览列出孤立位、补位、尺寸重置、坐标夹取和碰撞移位及其前后几何。缺失或非法尺寸使用已注册定义的推荐尺寸。缺失定义的实例保留原配置与有效尺寸，缺少可用尺寸时进入显式备份恢复。重复或空关联键阻止自动修复。 [几何修复](D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore/packages/kernel/src/capabilities/home-dashboard-recovery.ts:61)
- 确认绑定 Vault ID、目标 revision、原始字节 SHA-256 和候选 SHA-256。恢复和既有整板更新共用同一 Vault 的提交队列；写入复用 VaultFiles 字节 CAS。确认替换损坏的当前格式板前，将原字节保全到 `.huhu/home/widgets.json.corrupt-<sha256>` 并逐字节核对。同名且字节一致的保全副本可复用；目的处有不同字节则停止。未知、旧格式或无法解析并确认来源的目标受覆盖保护。 [目标与保全](D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore/packages/kernel/src/capabilities/home-dashboard.ts:170)

## 验证

| 验收项 | Windows 实测 | 证据 |
| --- | --- | --- |
| 备份恢复、重开与保留数据 | 从源 Vault 经真实 Engine HTTP 取得带隐藏实例和缺失定义的备份。在空目标 Vault 预览、确认、重开并通过生产 get 回读。实例与几何完全相同，源板、已有备份、合成业务笔记、专注与习惯状态逐字节一致。 | [HTTP 用例](D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore/apps/engine/test/dashboard-recovery.test.ts:115) · [运行日志](http-and-kernel.log) |
| 两次预览、确认及并发 | 两次预览对象完全相同，VaultFiles 写调用为零，原板、相邻文件和目录项一致。两个不同幂等键并发确认只产生一次保全及一次整板写，另一请求返回 `VERSION_CONFLICT`。成功使用相同幂等键重放得到同一回执。 | [HTTP 用例](D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore/apps/engine/test/dashboard-recovery.test.ts:143) · [运行日志](http-and-kernel.log) |
| 拒绝不安全输入 | 覆盖未知版本、旧格式、损坏 JSON、非法 UTF-8、空与重复关联键、缺失定义且无可用尺寸、无效备份、错 Vault 和改动确认意图。还覆盖只读、revision 变更及同 revision 字节变化。已有恢复备份和原板按用例逐字节核对。 | [格式与关联用例](D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore/apps/engine/test/dashboard-recovery.test.ts:186) · [冲突与只读用例](D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore/apps/engine/test/dashboard-recovery.test.ts:261) |
| 保全或替换失败 | 保全目的已存在不同内容时返回 `preservation-failed`，两份文件内容无变化。保全后注入原板新字节，真实 VaultFiles CAS 拒绝覆盖并保留原件副本；原目标恢复为原字节后可以复用已核对的副本提交。 | [CAS 用例](D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore/apps/engine/test/dashboard-recovery.test.ts:230) · [保全失败用例](D:/Document/code/huhu/temp/issue-worktrees/dashboard-restore/apps/engine/test/dashboard-recovery.test.ts:261) |
| 回归及静态检查 | Kernel 全量、既有 dashboard-save 和新增 recovery 共 14 文件 103 项通过。Engine 首页布局读取定向组 3 项通过，45 项按名称筛选跳过。Contracts、Kernel、Engine TypeScript、三个改动文件的 oxfmt 与 oxlint、暂存及提交差异检查通过。 | [Kernel 与 HTTP](http-and-kernel.log) · [Engine 读取](engine-layout-regression.log) · [Contracts](types-contracts.log) · [Kernel](types-kernel.log) · [Engine](types-engine.log) · [格式](format.log) · [Lint](lint-diagnostics.json) |

验证使用 Windows x64 10.0.26300、Node 24.21.0、pnpm 12.10.1、Vitest 3.2.7 和新建合成 Vault。冻结安装经 Corepack 完成。pnpm 自动写入本检出的包管理器元数据已还原，`pnpm-lock.yaml` 字节对应 Git blob `8165f3147cf5564a2d36a67959f3afed0d697f95`。测试的 HTTP 回执按已有 `CapabilityResultSchema` 解码，修正首次 Engine 类型检查发现的 `Response.json()` 类型收窄缺失后，已复跑全部相关检查。安装和验证 pane `t127`、`t12f`、`t12j` 均已关闭。 [安装日志](install.log) · [首次类型检查](types-engine-initial.log)

## Lead 接线

- W06 保留生产登记、UI 及 Vault 包收集的接线所有权。当前的私有确认字段可作为接线候选。客户端应提交预览原样返回的 `confirmation` 和相同 `intent`，并沿用整板更新的幂等键语义；可用 `changes`、`writable` 与提交结果的 `preservedPath` 表达恢复状态。
- 恢复输入按 W02-04 的当前格式备份形状和完整布局校验，保留备份中的不透明配置。普通整板更新继续使用已有 Widget 规则，未知类型仅可原样带回。自动修复保守拒绝来历不明、关联含混或缺少可信尺寸的板。含混但可确认版本的原件可在显式备份恢复前保全。
- 本次完成数据与写入切片；用户界面体验和生产入口的 ACC-DASH-12 联验仍由 W06 执行。

## Lead 验收

由 Lead 追加。

