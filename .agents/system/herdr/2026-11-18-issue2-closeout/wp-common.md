# 工作包通用要求（closeout4）

- 依据：规格逐项复核 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pQ/report01.md`（下称「复核」）。每个子要求按复核给出的「未实现」「缺验证」处理；「最小补齐」是起点，不是上限。规格原文为准：`.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/{spec.md,decisions.md,source-issue-2.md}`。不得把必需项降为可选；遇到规格原文与固定 OK 行为冲突、或需要改变规格的情况，停下该子项，在报告「待用户决定」节写明选项与影响，继续其余子项。
- 先查现有实现与 `temp/sources` 参考，再自行开发（AGENTS.md）。前端改动先执行 `.agents/skills/zh-modern-web-guidance/SKILL.md` 的 search / retrieve。vendor 改动登记 PATCHES.md，`node scripts/ok-patches.mjs --check` 与 `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --refresh-replay` 保持一致。
- 缺陷先用测试判红再修；「缺验证」项补真实断言（Electron e2e 优先，断言用户可见结果与磁盘字节，不只看测试名或无报错）。
- 只改本工作包归属的文件；必须触及他包文件时，改动最小并在报告列出（集成时由 Lead 解决冲突）。
- 门禁：format:check、lint、typecheck、test、test:vendor、build（含 check:ok-css）、knip、notices。e2e：本包新增与相关用例，单 worker、零重试（`--retries=0`）。多个工作包并行，机器负载高属正常；功能测试不需等负载，但失败须区分超时与断言，超时类在负载 <4 时重跑并如实记录。性能测量不在本包做（WP7 除外）。
- 提交到本分支，不推送。报告写 `reportNN.md`：逐子要求一行（复核编号、原分类、现状态、断言 文件:行 / 证据）、改动摘要、验证结果（命令、退出码、通过数、重跑记录）、待用户决定、未完成项。完成后 manifest 中本 pane 改为 `taskNN.md done`（阻塞写 blocked）。
