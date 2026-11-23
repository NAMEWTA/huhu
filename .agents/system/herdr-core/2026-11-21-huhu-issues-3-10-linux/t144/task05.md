# Mail 恢复提示与可观察重试
Lead t3p；worker t144；工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux。
读取 temp/final-audit/t152-report01.md。仅修复其新 P3 和直接 E2E 缺口：历史 graph-send-permission 文案明确为上次投递时的状态；源草稿已丢弃时解释不能重试。E2E 等待查询就绪后断言只接收不能重试；恢复后实际提交并核对原收件人和提示。优先复用现有 fixture/查询状态，不增加基础设施。
可写 plugins/mail/src/ui/MailOutbox.tsx、对应 Mail UI 测试、tests/e2e/workflows/mail.spec.ts 及必要的现有 Mail fixture；不得改 Notes/SSH/共享契约。前端沿用已读取的现代 Web 指南。
只写代码和测试，不执行测试/typecheck/E2E/build/全仓门禁，不开子 agent，不提交。报告写 temp/final-audit/t144-report05.md，说明修改与未运行验证。完成后等待 Lead 收取。
