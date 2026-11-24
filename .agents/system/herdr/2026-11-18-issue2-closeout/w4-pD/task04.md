# task04 · 新建笔记后文件树仍为空 / 新建任务按钮缺失（a11y.spec.ts:64 间歇失败）

角色：疑难分析（gpt-6.2-astra high），只读业务文件。工作目录 `/home/wta/projects/huhu-wt-analysis`，`git checkout --detach cf882bd`（最终候选，分支 closeout/issue2-integration）。可写：本目录 report04.md；探针放 /tmp 并写明。

## 现象
`tests/e2e/a11y.spec.ts:64`「键盘：不碰鼠标新建笔记、新建任务并用空格勾选」在此前所有全量运行中均通过（9b143a4 / 471dfdf 等），在 cf882bd 的全量零重试中首次失败；6 worker × 30 次压测再失败 1 次，但症状不同：
1. 全量（#3，负载约 8）：经新建笔记对话框创建「键盘笔记」后，笔记已在标签中打开，侧栏底部显示「1 个文件」，但文件树显示「0 个文件 · 0 个文件夹 / 还没有文件。」，5 s 内未出现该行。现场：`/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int8/test-results-final/a11y-*/`（error-context.md、trace.zip）。
2. 压测：切到任务模块后 30 s 内找不到「新建任务」按钮。现场：`/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int8/a11y-out/`。
相关背景：pB 在 G07 拆分试跑中曾见「已打开知识库但文件树空列表、笔记计数 2001」，当时归因于文件列举回调与菜单回调共用被动 effect，交付构建拆开了生命周期（见 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/g07-budget.md`「task02 定因与拆分」）。

## 要求
- 用 trace（`pnpm exec playwright show-trace` 或解包读取 trace 内的 actions/network/console）定位：文件树为何没有收到 / 应用创建后的列举；任务按钮为何缺失。确认是产品缺陷还是测试同步问题，给出代码位置与证据。
- 判断是否本收尾（`9f870c0..cf882bd`）引入：对比 main `9f870c0` 的对应代码路径；必要时在 `/home/wta/projects/huhu-wt-rc4` 或临时 worktree 上对照（可 `git worktree add` 到 /tmp）。
- **Lead 正在做 G07 低负载测量，请先只做代码与 trace 分析，不要运行 e2e 或全量单测**；我会在测量结束后通过 pane 通知你可以跑复现。
- 给出修复建议（文件、范围、验证方式），由 Lead 派给实现会话。
回报 `report04.md`，manifest 中 w4:pD 改为 done。
