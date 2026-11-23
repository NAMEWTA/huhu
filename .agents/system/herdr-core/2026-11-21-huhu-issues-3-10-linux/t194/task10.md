# task10 Agent 布局候选独立审查
Lead t3p；worker t194；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
先前Graph脚本已收到，将由t176返工。本任务只读审查 t176-task23-final.md 与其中12个冻结文件，以及Lead scripts/accept-linux-candidate.sh 的workspace选择2项调整。只写 temp/final-audit/t194-task10-final.md，不改业务、不启动agent、不跑重型测试。
固定基线5ea79f71 + 当前task23工作树，历史改动尚未开始。核对W2.2未放置会话放入当前标签（空叶/已有会话右分割、Space版本/布局CAS/导航后焦点）、W8.1已保存纯布局包恢复（当前源、冷导出私有Core所有权、外部过滤、暂存校验、终端未绑定、打开零隐式启动、首次CAS保全其他Spaces）。按原Issue/spec/prototype判断，不扩大需求。
Lead已实跑 workspace-package-live.log 6/6零跳过，worker类型/格式lint通过。安装包E2E尚未运行；不要冒充已通过。确认生产行为与测试差距及明确缺陷。原始 t176 plan 冷读设计后已改为复制单文档到独占临时Core，按最终代码/报告审查。
