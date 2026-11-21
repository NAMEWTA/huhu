# task01 · B06：键盘重新聚焦后到文档起点时被观察器复位

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-pm`，分支 `closeout2/b06`（= main f16f614，依赖已装）。完成后提交，不推送。

依据：独立审查 `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/herdr/w4-pE-report07.md`「折叠光标还有一条应修边界」：`DOMObserver.flush()` 保留 1.41.8 的文档起点复位启发式——焦点建立未满 200 ms、最近 300 ms 无点击/触摸且本轮无文档变更时，刚有可信 Home/Ctrl+Home 到达文档第一个可放光标的位置，observer 仍可能写回模型旧位置。现有补丁与证据：`patches/prosemirror-view@1.41.8.patch`、`evidence/herdr/w4-pH-report02.md`、`evidence/pm-focus/README.md`、`tests/e2e/knowledge/editor-selection-focus.spec.ts`。上游 prosemirror-view 1.43.0 源码可从 npm 包核对。

要求：
1. 先用真实 Electron 补对照：纯键盘（Tab 或快捷键）重新聚焦到首段末尾 → Ctrl+Home / Home 到文档起点 → 断言 DOM 与 PM 都在起点、随后 Shift+End 选中首段；以及无导航时浏览器复位行为保持（原光标恢复）。先确认能否判红。
2. 若能判红：在补丁中按上游语义修正（可信导航后不让起点启发式覆盖用户导航），源码/ESM/CJS 一致，更新指纹、R-53、notices；若不能判红，给出启发式在该路径上不会触发的运行证据（含时序插桩），并保留用例作为回归。
3. 验证（零重试）：`editor-selection-focus.spec.ts` 全部、`editor-parity-selection.spec.ts`、`editor-parity-closeout.spec.ts`、`editor-s3-*`、`i18n-zh-hans`、`comments-*`、`HUHU_PERF_STRICT=1 perf.spec.ts`；`pnpm test`、`test:vendor`、`typecheck`、`lint`、`knip`、`format:check`、`build`、`notices`、`ok-patches --check`。
4. 负载纪律：w4:pK、w4:pN 同时工作；e2e 前确认无其他 Electron/Playwright，记录起止 uptime。
写入范围：该补丁、锁文件指纹、`docs/upstream/ledger.md`、`THIRD_PARTY_NOTICES.md`、`tests/e2e/knowledge/editor-selection-focus.spec.ts`、`evidence/pm-focus/README.md`。
回报 `report01.md`，manifest 中 w4:pM 改为 done。
