# Mail 同地址子集恢复
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Core wta-ubuntu，Lead t3p，执行 t4x。工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，当前分支 impl/huhu-issues-3-10-desktop-web-verify。task11 已由 Lead 保存为 fa472010 并合入集成，继续使用此工作树。
按 dev-build/dev-tdd 修复 t5h/report07.md 第四节第一项的明确产品缺口。先读该报告、批次 decisions-2026-11-21.md 和 Mail 规格。子集同地址预检显示双方、默认跳过，用户可显式保留为独立账号，旧认证和 revision 不变。贯通独立 ID、草稿/投递/读标记引用重映射、恢复映射持久化与稳定重试，不允许网络重发。保留损坏数据等冲突拒绝。复用现有 journal，不另造基础设施。
可写 plugins/mail 下相关业务、shared descriptor、单测和 tests/e2e/mail 下相关 spec，其余业务文件只读。若确需共享 contracts 或注册改动，报告明确必要变化，由 Lead 处理。涉及前端先按 zh-modern-web-guidance 完成 search/retrieve。仅运行本次相关单个 Vitest 文件。禁止全仓类型检查、lint、E2E运行、构建或打包。不动 SSH。报告 report12.md 列修改、实际测试、未运行项和潜在兼容影响。完成后保留修改给 Lead 检查，不自行提交/远端写入，不派生代理。
