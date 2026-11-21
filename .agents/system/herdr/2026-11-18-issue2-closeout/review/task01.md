# 独立审查 · closeout4 集成候选

角色：独立审查（gpt-6.2-sol xhigh）。只读审查候选 `/home/wta/projects/huhu-wt-int`（分支 `closeout4/final` = a86dbbf）。不改仓库文件；可写 /tmp 与本目录 report01.md。不要启动全量 e2e；单个用例确认可跑（启动前确认无其他 Electron/Playwright，单 worker、零重试）。

范围：`git diff f16f614..a86dbbf`（main 之后全部改动，含新增文件；`git diff --stat` 先看全貌）。后续还会合入 w5:p8（G04/H04 补充）与 b01（B01 断言），不在本次范围。
依据：规格 `.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/{spec.md,decisions.md,source-issue-2.md}`；逐项复核 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pQ/report01.md`；用户决定 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/user-decisions.md`；各包报告 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p2/report01.md`、`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p3/report01.md`、`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p4/report01.md`、`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p5/report0{1,2}.md`、`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p6/report01.md`、`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p7/report01.md`。

要求：
1. 正确性缺陷：数据丢失/字节破坏（BOM、CRLF、YAML、草稿迁移、移动/回收）、会话与保存竞态、锚点、释放与泄漏、安全（评论 Markdown 渲染、外链 IPC、预览协议、host-fetch 作用域）、多个工作包合并后的交互（RichMarkdownEditor、NotesModule、NoteEditorSurface、provider-pool 的合并结果是否保留各方意图）。给出可复现的触发条件，能写最小复现就写。
2. 规格符合性：对复核中每个「未实现 / 缺验证」条目，核对候选是否已实现、测试是否真正断言了规格要求（看断言，不看测试名）；指出仍未满足或被悄悄降级的子要求。用户决定以 user-decisions.md 为准。
3. 合规：AGENTS.md（前端 zh-modern-web-guidance、window.huhuHost 宿主接口）、vendor 补丁登记与重放、测试是否有 skip/条件跳过掩盖失败。
每条发现给 严重度（阻断/应修/建议）、文件:行、触发条件、建议修法。回报 report01.md，manifest 中 review 行改为 task01.md done。
