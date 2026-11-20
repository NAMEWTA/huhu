# task05 · 复审最终候选 e85d281

角色：独立审查（gpt-6.2-sol xhigh），只读业务文件。工作目录 `/home/wta/projects/huhu-wt-review`，`git checkout --detach e85d281`（`closeout/issue2-integration`）。

范围：`git diff cf882bd..e85d281`（含新增文件 `tests/e2e/knowledge/explorer-first-listing.spec.ts`）及 `git log --graph cf882bd..e85d281`。
- `affeb58`（pB，报告 `w4:pB/report09.md`；依据疑难分析 `w4:pD/report04.md`）：文件树列举路由与菜单回调拆 effect；a11y 键盘用例同步；首次列举受控回归用例（构建副本中门控时序，请评估该用例是否可靠、是否会因打包产物变化而静默失效）。
- `6d76add`（pA，报告 `w4:pA/report09.md`；依据疑难分析 `w4:pG/report01.md`）：G07 启动测量改为浏览器同帧 rAF 计时，旧 locator 计时并列为 `homeLocatorMs`，新增 A/A 模式。请判断：新端点是否仍测的是规格 G07「首屏与非知识库冷启动」、计时换算（两端 timeOrigin）是否正确、是否有把回退“测没了”的风险。

**本轮只做静态审查与读日志**：Lead 正在同机跑 G07 正式测量、全量 e2e 和打包，**不要运行任何测试、构建或 Electron**。Lead 的结果完成后会追加给你（`/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/`）。
验收：逐项给出是否成立、问题位置与影响，按阻断 / 应修 / 可选分级。回报 `report05.md`，manifest 中 w4:pE 改为 done。
