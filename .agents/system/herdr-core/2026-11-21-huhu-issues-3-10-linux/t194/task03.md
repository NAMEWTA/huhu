# task03：独立外部 Agent 同包闭环用例审查
工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration。Lead t3p。
完成 task02 后只读检查新增 tests/e2e/helpers/external-agent-desktop.ts、tests/e2e/workflows/external-agent-desktop.spec.ts，以及 wrapper external-agent 分支。报告实现者 temp/final-audit/t176-report21.md。
目标 CLI-only 和 HTTP MCP-only 两条创建/修改/派遣/答复/唯一结果，再桌面同任务原会话；真实候选 AppImage 原生 Codex 与回环 Responses。关注真实能力输入/意图键、工具入口不能偷用桌面写入、清理隔离与同包身份。静态通过，不代表E2E通过。仅读、无agent、无重型验证；报告 temp/final-audit/t194-report03.md。
