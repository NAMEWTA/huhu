# task09 会话确认后的历史资格刷新
Lead t3p；worker t197；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
真实 UI 日志 temp/final-audit/history-dialog-ui.log 在 Claude 分支确认后父历史 resume 长期 disabled；history-state-ui.log 增加只读API核对后父 canResume=true 且界面恢复，证明异步事件时序。packages/workbench/src/engine-client/query.ts ENTITY_CAPS agent-session 目前只刷新 agent.sessions.list，不刷新 agent.history.list。请先核对实际事件和调用路径，用现有单文件 query 测试证明会话身份确认后历史查询更新，再最小修复。授权 query.ts 和对应已有单测文件，仅必要事件映射；不改 Lead 持有的 tests/e2e/shell.spec.ts，不改其他业务、不新代理、不重型。客户端变更先执行 Modern Web Guidance search/retrieve，复用已有刷新设施。报告 temp/final-audit/t197-task09-final.md，冻结哈希、红绿、未跑。若发现不同根因，先反馈。Lead 另修测试 locate 后自动隐藏历史面板需重开的问题。

Lead范围补充：已授权 plugins/agent-cli/src/engine/sessions.ts、index.ts、test/sessions.test.ts，确认身份持久化后使用现有 agent-session 事件，确保只在身份首次改变时发布；配合 query 映射。无需再次确认。
