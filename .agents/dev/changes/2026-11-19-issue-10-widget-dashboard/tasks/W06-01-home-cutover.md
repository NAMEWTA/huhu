# W06-01 一次切换到单一首页并验收

唯一装配者替换三页签和旧 hidden/order 写者、移除旧接口调用，更新 D-37 的卡体归属、来源台账与 notices。新板验收仅用临时新格式 Vault。

**规格范围**　ACC-DASH-01、ACC-DASH-02、ACC-DASH-03、ACC-DASH-04、ACC-DASH-05、ACC-DASH-06、ACC-DASH-07、ACC-DASH-08、ACC-DASH-09、ACC-DASH-10、ACC-DASH-11、ACC-DASH-12、ACC-DASH-13、ACC-DASH-14、ACC-DASH-15、ACC-DASH-16、ACC-DASH-17、ACC-DASH-18。[行为规格](../spec.md#用户验收) · [设计与边界](../design.md) · [计划与运行环境](../plan.md#执行边界)

**前置产物**　[S1a-03 的桌面退出契约](../../../archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/tasks/S1a-03-quit-transaction.md)、[W04-07 的看板离场处理](W04-07-leave-draft.md)、[W02-05 从新格式备份恢复已提交布局](W02-05-restore-board.md)、[W03-03 复制卡片并单独修改配置](W03-03-copy-config.md)、[W03-04 隐藏并找回布局实例](W03-04-instance-visibility.md)、[W03-05 停用或缺失插件后找回原卡](W03-05-missing-definition.md)、[W03-06 在单卡内修复错误并重试](W03-06-card-recovery.md)、[W03-08 只移除选中的布局实例](W03-08-remove-instance.md)、[W04-04 仅用键盘完成布局编辑](W04-04-keyboard-grid.md)、[W04-05 窄屏调整顺序与尺寸后在桌面恢复](W04-05-narrow-layout.md)、[W04-06 保存冲突后对照已提交布局](W04-06-save-conflict.md)、[W04-08 切换 Vault 后隔离迟到的布局与业务结果](W04-08-vault-isolation.md)、[W04-09 恢复默认看板前可以反悔](W04-09-reset-defaults.md)、[W05-01 在两张任务卡按各自筛选完成任务](W05-01-tasks-widget.md)、[W05-02 从最近笔记卡定位所选笔记](W05-02-recent-notes.md)、[W05-03 从待处理捕获卡回到收件箱](W05-03-capture-widget.md)、[W05-04 专注计时跨模块持续并在关窗时暂停](W05-04-focus-widget.md)、[W05-05 独立显示习惯并保留打卡记录](W05-05-habits-widget.md)、[W05-06 按模块浏览最近活动](W05-06-activity-widget.md)、[W05-08 从版本卡查看当前 Vault 的 Git 状态](W05-08-git-widget.md)、[W05-09 从自动化摘要查看真实规则或运行](W05-09-automation-widget.md)、[W05-10 从看板进入 Agent CLI](W05-10-agent-entry.md)、[W05-11 从指标概览核对四项业务数量](W05-11-summary-widget.md)。完整入口需业务卡、画布、恢复、跨 Vault、离场及用户确认的体验同时可用。

**现有代码入口**　[renderer/main.tsx](../../../../../apps/desktop/src/renderer/main.tsx) · [home/HomeModule.tsx](../../../../../packages/workbench/src/home/HomeModule.tsx) · [src/contributions.ts](../../../../../packages/workbench/src/contributions.ts) · [capabilities/home.ts](../../../../../packages/kernel/src/capabilities/home.ts) · [src/home.ts](../../../../../packages/contracts/src/home.ts) · [e2e/shell.spec.ts](../../../../../tests/e2e/shell.spec.ts) · [packaged/packaged.spec.ts](../../../../../tests/e2e/packaged/packaged.spec.ts) · [tests/visual](../../../../../tests/visual) · [upstream/ledger.md](../../../../../docs/upstream/ledger.md) · [scripts/gen-notices.mjs](../../../../../scripts/gen-notices.mjs)。

**原型对照**　从默认板走完目录、配置、编辑、保存/取消/冲突、窄屏、缺插件与离场。按同状态同视口回归。待用户按本场景确认布局、操作与反馈，采用评审记录中的实际版本及范围。[演练入口](../prototype/index.html#dashboard) · [版本与待确认范围](../prototype-review.md)

## 验收步骤

1. 从根执行 pnpm typecheck、pnpm lint、pnpm test、pnpm e2e、pnpm e2e:packaged、pnpm visual:compare、pnpm notices。安装版重启、宽窄窗、四主题×明暗、放大字体及读屏键盘覆盖 ACC-DASH-01～18，以规格修订范围为准。
2. 反复启停、快速拖动缩放、切两 Vault、拒写和失联后核对文件/订阅/渲染轨迹，切换布局不改业务文件。共享组件先独立验，#6 Web 可用时再补整站。PR/发布另按授权。
3. 两项前置交付后，用安装版打开测试 Vault，同时留下未保存的布局改动和一条待落盘的笔记。分别从系统 X、应用退出菜单发起关闭，验证保存、放弃、继续编辑及保存失败。保存时应先写布局再完成文档检查，重开可读两者。放弃只丢弃布局草稿，仍须处理笔记。继续编辑、写失败或冲突时保持原窗口和 Engine 运行，草稿可继续编辑或重试。记录关窗结果以及重开后的布局 revision、笔记或可恢复草稿。

在临时 Vault 或指定样例记录操作前后状态。涉及业务查询、保存与恢复时一并核对真实输入输出。
