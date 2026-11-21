# 复审 · closeout4 集成候选 4f6b703

角色：独立审查（gpt-6.2-sol xhigh），新会话。只读审查 `/home/wta/projects/huhu-wt-int`（`closeout4/final` = 4f6b703）。可写 /tmp 与本目录 report02.md。不启动全量 e2e；单个用例确认可跑（单 worker、零重试，启动前确认无其他 Electron/Playwright）。

1. 复核上一轮审查 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/report01.md` 每条发现（阻断、应修、建议）在当前候选上是否真正修复：重跑其探针 `/tmp/huhu-e550c52-review.vh8KEK/{cm.cjs,probes.mts}`（按需改路径），并看新增测试是否断言了对应场景。修复说明见 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/fix/report01.md`。
2. 审查 `git diff e550c52..4f6b703` 的全部新增改动（含 b01 两轮 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/b01/report0{1,2}.md`、fix、合并提交），找新的正确性缺陷、回归与合并丢失（上一轮合并曾丢失测试闭合括号）。
3. B01 收口：`.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/parity-matrix.md` 每一行最终「验证状态」列必须是具体断言链接、或带出处的不适用/范围登记；列出仍为「未单独验证」「未核实」「待定」「推定」的行（例如第 208、214、254、255、353 行附近），判断是否构成 B01 缺口。用户决定以 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/user-decisions.md` 为准。
4. 规格逐项：以 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pQ/report01.md` 为清单，给出当前候选上仍未满足的必需子项（不含需在最终构建上实测的 G06/G07/F09/H05 成本/H02 视觉/打包，这些由 Lead 最终链实测，只需指出测量要求）。
严重度（阻断/应修/建议）、文件:行、触发条件、建议修法。回报 report02.md，manifest 中 review 行改为 task02.md done。
