# 最后一批剩余项（实现后由 Lead 统一测试一次）

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-rest`，分支 `closeout5/rest`（= main 38cc28f）。通用要求 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。
测试纪律（用户要求）：本会话**不跑 Electron e2e、不跑性能**；只跑单元测试与静态门禁。新增的 e2e 用例只写不跑，Lead 会在全部完成后统一跑一次全量。e2e 必须能通过 typecheck/lint。

依据：复审 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/report02.md`；上一会话的半成品已回退，可参考已删除的实现：`git show e3c97da`（fix2b 现场，含镜像/Excalidraw/PDF 块的 Vault 读取、端点扫描方法维度、B03 对拍、TaskEditor e2e、local-reference-blocks.spec）与 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/fix3/report01.md` 的回退清单。用户决定 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/user-decisions.md`。

要求：
1. B01 118/119/114：镜像、Excalidraw、内嵌 PDF 块通过当前 Vault 受控本地读取与失效通知加载未打开文档（含 `/api/config` 宿主调用）；单测 + 写好 e2e（已有文件、变更后更新、切 Vault、释放）。
2. B01 矩阵：第 208、353 行回填断言，98/169/346/348/354 改为具体出处，修复 65/128/266/288/297/300 行落空锚点，§15/§18 全表计数。
3. H04：`check-host-endpoints.mjs` 按方法+路径逐调用记录绑定 handler，`--assert` 退出 0。
4. B03：在 `tests/parity-ok/compare.spec.ts` 写同序列对拍用例并更新 `evidence/parity-ok/slash.md` 的待跑说明（Lead 统一跑）。D02：更新 `evidence/parity-ok/comments.md` 按用户决定的渲染差异与不可达依据。
5. H05：写已有任务 TaskEditor 修改入口的输入、撤销后再组合、保存重开 e2e。
6. Q6/Q8：`evidence/s0-facts.md` 写明证据限制；发布草稿写明旧名外部消费者核实范围与结论。
7. 门禁：相关单测、typecheck、lint、format:check、build、knip、notices、ok-patches --check（vendor 改动刷新 replay 与 catalog）。
提交到本分支。回报 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/rest/report01.md`，manifest 中 rest 行改为 task01.md done。
