# 任务报告 · #9 P3.1、P3.3 个人多账号工作区与锁定

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17j`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17j/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17j/report01.md`
- 执行结果 — `done`，覆盖 task01 指定的创建、切换、编辑、显隐和锁定核心路径

## 结论

桌面保险箱可一次创建三个账号并在列表查看账号数。已保存条目的名称、网址和指定账号可分别编辑，同名账号也可切换。密码默认遮罩，显式请求当前账号的密码。切换账号、离开个人工作区或锁定时清理界面状态。手动锁定会立即卸载受保护界面，外部锁定事件会中止当前解锁代的请求。

保存冲突时保留草稿，可确认重读并重新编辑。回执丢失时仍按原版本重试，避免重复创建。已提交但回执丢失的情况下，用户可刷新条目列表并核对保存结果。界面以原型确认的多账号选择器、表单内锁定、放弃确认和窄窗返回为依据。原型目录 SHA-256 与确认记录一致，为 `d3b206857caed6e0e1d2c0d6ee505a0387c8f44fdedc249efd578de4f4d13f83`。

## 产物与改动

- 工作目录 — `D:/Document/code/huhu/temp/issue-worktrees/safe-accounts`
- 分支 — `impl/huhu-issues-3-10-safe-confirmed-ui`
- 基线 — `6da1b2ec`
- 本地提交 — `e2f84e9d44f61c14d3e42f4b5e2b2f83e9e8dcb6`
- 交付状态 — 工作树干净，供 Lead 本地整合。
- Safe UI 复用现有状态、Dialog、Field 和六项个人条目能力。详情、草稿和显式读取结果在工作区组件中保存，离开时释放。账号选择器使用位置区分同名账号。 [SafeModule](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/src/ui/SafeModule.tsx) · [工作区](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/src/ui/PersonalWorkspace.tsx) · [编辑表单](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/src/ui/EntryEditor.tsx)
- 两项任务文档已回填验证结果，复跑命令记录在同一份证据中。 [验收证据](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence-p3.1-p3.3.md)

## 验证

Windows x64 26300，Node 24.21.0，pnpm 12.10.1，Playwright 1.65.0，Electron 44.9.1 / Chromium 152.0.7977.167，Chrome 157.0.8103.51。使用项目自动化、临时 Vault、合成账号和回环网络。前端实现前以离线方式执行 modern-web-guidance 的 search 和 retrieve，核对 forms、accessibility、dialog 和 css-layout。

| 验收要求 | 实际检查与结果 | 证据 |
| --- | --- | --- |
| 桌面多账号 | 1440×900，键盘新建三个账号。必填校验、长文本、手机号前导零、同名账号、编辑公共网址和独立更新第二个账号通过。Esc 返回继续编辑时草稿保留。 | [界面测试](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/tests/e2e/shell.spec.ts:681) · [桌面截图](<D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/test-results/shell-保险箱：多账号创建、编辑、显隐与锁定清除/safe-desktop-masked.png>) |
| 窄窗与回执 | 390×844，三个账号创建、详情返回及焦点还原通过。丢弃已提交的响应后，按原版本重试只得到冲突且列表只有一条记录。真实并发修改后，重读再保存通过。 | [窄窗测试](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/tests/e2e/shell.spec.ts:880) · [窄窗截图](<D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/test-results/shell-保险箱：窄窗创建三账号，保存回执丢失与编辑冲突/safe-narrow-detail.png>) |
| 显隐、锁定与磁盘 | 默认无 reveal 请求。保留、设置、清空及显式显隐通过。离开后重新进入仍遮罩，表单内锁定清掉草稿。切账号及外部锁定后释放延迟响应，旧值未重新渲染。合成个人字段及密码样本在临时 Vault 文件扫描中无命中。 | [界面测试](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/tests/e2e/shell.spec.ts:681) · [引擎定向测试](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/test/personal.engine.test.ts) |
| Web 正常入口 | Chrome 加入本机 Web 分享，保险箱展示桌面提示，返回工作台通过。 | [浏览器测试](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/tests/e2e/shell.spec.ts:837) |
| 回归和构建 | Playwright 3 项通过。Vitest 3 个文件、34 项通过。Electron 构建、Safe 类型检查、oxlint、stylelint、oxfmt 和 Git diff 检查通过。 | [复跑命令](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence-p3.1-p3.3.md) |

## 阻碍与接续

- P3.1 多标签选择依赖 P2.1 的目录与写入契约。把账号添加到已保存条目依赖对应的账号创建契约。真实 UI 切 Vault 清理草稿仍待验，引擎层切换已通过。
- P3.3 外部敏感读取开关、完整的日志与缓存运行时检查仍待验。本切片已检查组件边界并扫描测试 Vault。权限侧需 Lead 核对 Engine 声明的 `desktopOnly` 语义。当前 Safe 能力沿用已有非开放声明，Chrome 证据覆盖普通界面的桌面门槛。 [能力定义](D:/Document/code/huhu/temp/issue-worktrees/safe-accounts/plugins/safe/src/engine/index.ts:25)
- 其他任务待验包括 P0 本机独立认证、P1.4 改主密码场景、P2 标签及完整搜索组合、P3.2 删除与 P3.4 复制、P4–P7 模块认证接入、P8 备份恢复及 Git、P9 清洁安装，以及 P10 对外访问与切换证据。现有 Safe 测试提供部分引擎层证据，各任务仍需各自的产品入口验收。

## Lead 验收

由 Lead 核验本地提交与以上证据后填写。

## Lead 核验结果

已对照 e2f84e9d 和已记录的 Windows 桌面、浏览器及私有库证据。P2 使用独立后续任务。
