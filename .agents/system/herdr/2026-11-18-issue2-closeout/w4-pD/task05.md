# task05 · 块类型用例：点击文字 + Home + Shift+End 后 DOM 选区为空（间歇）

角色：疑难分析（gpt-6.2-astra high），只读业务文件。工作目录 `/home/wta/projects/huhu-wt-analysis`，`git checkout --detach 3dbd420` 后 `pnpm build`（最终候选）。对照 e85d281 构建在 `/home/wta/projects/huhu-wt-perf`（已构建，勿改）。可写：本目录 report05.md，探针放 /tmp。

## 现象
`tests/e2e/knowledge/editor-parity-closeout.spec.ts:580`「气泡块类型菜单显示完整类别，选取二级标题后保存重开」：在 3dbd420 全量零重试中 #46 失败于第 592 行——点击「转换目标」、`toBeFocused` 通过、Home、Shift+End 后 5 s 内 `window.getSelection().toString()` 一直为空。Lead 6 worker × 15 × 2 压测：3dbd420 1/30、e85d281 1/30 失败（与 F09 改动无关）。现场：`/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/test-results-final/`、`/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/bt-*`。历史：同族「气泡」失败曾由 `77d5add`（ProseMirror 聚焦 20 ms 回调写回过期光标，`patches/prosemirror-view@1.41.8.patch`）修复，见 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/pm-focus/README.md` 与 `w4:pE/report02.md` 第 5 条、`report06.md`「块类型 E2E 首跑红灯」。

## 要求
用插桩记录点击后的 PM selection、DOM selection、selectionchange / focus / keydown 事件、聚焦回调、文档 hydrate / settle / 外部替换（源码优先打开后构建富文本表示 P-S3-01 等）的时间线，确定 Home/Shift+End 后选区为空的机制：是产品缺陷（真实用户在负载下也会遇到的选区丢失或被重置）还是测试同步问题。判断是否本收尾引入（对比 main 9f870c0，可临时 worktree 到 /tmp）。给出修复建议（文件、范围、验证方式）。
负载纪律：w4:pJ 也可能在跑 e2e；每次前确认无其他 Electron/Playwright，记录 uptime。
回报 report05.md，manifest 中 w4:pD 改为 task05.md done。
