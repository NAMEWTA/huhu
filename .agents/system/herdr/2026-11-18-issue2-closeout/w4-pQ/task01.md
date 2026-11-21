# task01 · 规格逐项复核：台账「满足」是否有实际证据

角色：疑难分析（gpt-6.2-astra high）。只读。候选 `/home/wta/projects/huhu-wt-int`（分支 `closeout4/final` 4b4ce9c）。可写：/tmp、本目录 report01.md。

背景：台账 `.agents/dev/changes/2026-11-18-issue2-closeout/acceptance.md` 曾把 H05 标为满足，但证据只覆盖任务评论提交，收件箱想法输入仍是 textarea、IME 未在 compact 中测（已派 w4:pP 修复）。需要排查其他条目是否有同类高估。

## 要求
1. 以规格 `.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md` 的每个验收条目（A–H 全部、含 R 表中的回归要求）和 `decisions.md` 中带约束的决定为准，逐条把**规格原文的每个子要求**拆开，对照候选代码和台账列出的证据（测试文件里实际断言了什么，不看测试名）。
2. 每个子要求归类：已满足（给出断言所在 文件:行）/ 缺验证 / 未实现 / 行为回归 / 已登记不在范围（给出登记位置及是否为用户决定）。不得把必需项降为可选；台账自行设定的口径要标出。
3. 对「缺验证」「未实现」给出最小补齐建议。H05 与 G07 收件正文已在处理，只需核对剩余部分。
4. 不运行长 e2e；必要时可跑单个用例确认（负载 <2，无其他 Electron/Playwright，w4:pP 可能在跑）。

回报 report01.md，manifest 中 w4:pQ 改为 task01.md done。
