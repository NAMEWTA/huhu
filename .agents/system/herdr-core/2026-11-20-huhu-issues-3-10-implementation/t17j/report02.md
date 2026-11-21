# 任务报告 · #9 P2.1、P2.2 彩色标签和账号搜索

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17j`
- task — `task02.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17j/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17j/report02.md`
- 执行结果 — `done`

## 结论

个人保险箱支持创建、复用、改名、换色和删除彩色标签。新建或编辑条目时可选择已有标签，也可将草拟标签与条目一起提交。改名和换色沿用原 ID，影响所有关联条目。删除标签只解除关联，条目与账号保留。

按多个标签取交集。「无标签」与具体标签互斥，可再叠加搜索。查询邮件、手机号或备注等账号字段时，结果显示命中的账号位置，打开条目直接选中该账号。密码字段不参与检索。锁定后清除旧查询、筛选、账号选择和在途目录结果。

## 产物与改动

- 独立工区 — `D:/Document/code/huhu/temp/issue-worktrees/safe-accounts`
- 分支 — `impl/huhu-issues-3-10-safe-confirmed-ui`
- 基线 — `e2f84e9d44f61c14d3e42f4b5e2b2f83e9e8dcb6`
- 本地提交 — `ec781688a7608781ab3388769922d5d921417bf8`
- 提交后工作树干净，供 Lead 本地整合。代码及测试集中在 Safe 插件和新增的 Safe 标签 E2E 文件，验收记录回填 P2 两项任务。
- 标签目录复用 Safe 的加密、解锁代和写入队列。新增目录能力限制在桌面。标签名、颜色与关联通过认证加密保存，目录及受影响条目由同一份版本清单发布。 [存储](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/src/engine/store.ts) · [标签能力](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/src/engine/index.ts)
- 界面复用已确认的 Safe 工作区、Dialog、现有字段样式和主题颜色。筛选和查询只使用当次解锁的组件内存。 [工作区](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/src/ui/PersonalWorkspace.tsx) · [标签界面](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/src/ui/SafeTags.tsx) · [验收证据](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence-p2.1-p2.2.md)

## 验证

Windows x64 26300，Node 24.21.0，pnpm 12.10.1，Playwright 1.65.0，Electron 44.9.1／Chromium 152.0.7977.167。测试由项目自动化启动，使用隔离 Vault、合成字段及本机回环请求。已确认原型 SHA-256 复算匹配 `d3b206857caed6e0e1d2c0d6ee505a0387c8f44fdedc249efd578de4f4d13f83`。

| 验收 | 实际观察 |
| --- | --- |
| P2.1 创建、复用和编辑 | 同名创建复用原标签并保留原色。条目内应用已有和草拟的新标签，可同时关联和保存。两个条目共享标签后都读到新名称和新颜色。放弃包含草拟标签的表单后目录无该标签。尝试重名保留当前输入和原关联。 |
| P2.1 取消删除、提交失败及恢复 | 取消删除保留两个关联。确认后两个条目和账号仍存在，重开引擎读回的关系完整。故障注入覆盖暂存失败、发布前锁定，以及两条新条目密文和新目录密文均到位后清单发布失败。旧清单字节原样，失败的新版本文件被回收，重试后读到完整新代。 |
| P2.2 搜索和筛选 | 两个标签取交集。按无标签、清除筛选和选回具体标签均通过。名称、网址与标签查询有结果。邮件、备注和手机号定位到第二个同名账号。密码独有词零结果。 |
| P2.2 锁定和隐私 | 搜索并选中账号后锁定，查询、筛选和选中项清除。重新解锁时为全部条目与空查询。另一条已成功的目录响应在外部锁定后才释放，界面保持锁定。临时 Vault 逐文件扫描和真实全局 `vault.search` 对标签名与合成隐私字段均无明文命中。 |
| 回归 | 最终标签界面 2 项通过。另一次联合回归 5 项通过，含 3 项原多账号测试。Safe 定向 Vitest 共 3 个文件、36 项通过。Electron 构建、Safe 类型检查、oxlint、stylelint、oxfmt 和 Git diff 检查通过。 |

[复跑命令](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence-p2.1-p2.2.md) · [标签界面测试](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/tests/e2e/workflows/safe-tags.spec.ts) · [事务故障测试](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/test/personal.engine.test.ts) · [Claude 浅色截图](<D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/test-results/safe-tags-task02-final/workflows-safe-tags-保险箱标签：复用、随条目保存、改名变色、冲突和解除关联/safe-tag-links.png>) · [Claude 深色截图](<D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/test-results/safe-tags-task02-final/workflows-safe-tags-保险箱标签：复用、随条目保存、改名变色、冲突和解除关联/safe-tag-links-dark.png>)

## 待验及接续

- 搜索期间锁定及迟到目录响应已实测。真实工作台切换 Vault 时的 P2 查询竞态和超大 Vault 的读取负载待验。
- 默认 Claude 浅色和深色已查看。其他主题组合及辅助技术实机走查待验。
- 全局索引检查从真实 `vault.search` 入口执行。外部敏感读取策略、备份、Git 同步及安装包仍由对应切片验收。

### Modern Web Guidance

实现前离线执行了 search 和 retrieve。

- **`forms`** 我用原生 `fieldset` 和 `legend` 标出条目表单的标签组，并用 `role="status"` 通知保存结果。依据是 “announce AJAX submission results via `role="status"` or `aria-live`”。
- **`checkbox`** 我用带可见名称的原生复选框选择标签，保留键盘操作。依据是 “nesting the `<input>` inside the `<label>`”。
- **`accessibility`** 我让标签管理切换视图时聚焦列表、输入或取消按钮。依据是 “Manage focus correctly to and from updated content”。
- **`dialog`** 我复用原生 Dialog 的关闭处理，并让删除确认中的取消按钮先获得焦点。依据是 “put `autofocus` on the safe action”。

## Lead 验收

由 Lead 核验后填写。

## Lead 核验结果

已对照标签事务、锁定与回归，计划整合 ec781688。截图留存于 D:/Document/code/huhu/temp/issue-baseline/safe-confirmed-ui-proof。
