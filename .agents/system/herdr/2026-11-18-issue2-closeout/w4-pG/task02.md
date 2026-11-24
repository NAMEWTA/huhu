# task02 · 实时预览输入延迟 p95：rc.4 14.8 ms → 候选 21.8 ms

角色：疑难分析（gpt-6.2-astra high）。工作目录 `/home/wta/projects/huhu-wt-perf`，先 `git checkout --detach e85d281` 并 `pnpm build`（最终候选）。基线 `/home/wta/projects/huhu-wt-rc4`。可写：本 worktree 临时试验（不提交）、/tmp、本目录 report02.md。

## 现象（Lead 实测，空闲机，同一命令）
`HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '编辑输入延迟' --retries=0`
- rc.4（CodeMirror）：p95 14.8 ms，最大 25.8，样本 80 → 通过。日志 `/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/f09-huhu-wt-rc4.log`
- e85d281（OK 富文本）：p95 21.8 ms，最大 29.1 → 失败。日志 `/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/f09-huhu-wt-int.log`；全量中 21.3 ms。
- main 9f870c0 已有同水平（配对 22.4 vs 21.5，`.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/f09-findreplace.md`），即回退随 OK 移植 7edcaa8 进入。
- 项目质量目标：归档 `feature_2026-11-09-huhu-workbench-definition/quality.md:42` 编辑输入延迟 p95 ≤ 16 ms。Issue #2 F09 要求测量记录；Issue §14 末段允许「明确、审查过的预期变化」。

## 要求（有界：先定因再判断可行性）
1. 用 CDP / Performance 标记拆分一次按键：keydown → PM transaction → 插件 appendTransaction / view update（NodeViews、decorations、placeholder、comment marks、find-replace、drag handle、trailing affordance 等）→ y-prosemirror 同步 → Y.Text('source') 适配桥 / settle → DOM mutation。找出相对 rc.4 多出 ~7 ms 的主要贡献者（逐插件禁用的 A/B 在临时构建中进行）。
2. 判断能否在**不改变行为**的前提下（例如延后非关键工作到 idle / rAF、减少每键全文遍历、debounce 序列化）把 p95 降到 ≤ 16 ms；给出具体改法、文件、预期收益、风险及验证方式。若不可行（如 PM/Yjs 固有成本），给出证据。
3. 负载纪律：测量前确认负载 < 2、无其他 Electron/Playwright；每个结论至少 3 轮。
回报 report02.md，manifest 中 w4:pG 改为 task02.md done。
