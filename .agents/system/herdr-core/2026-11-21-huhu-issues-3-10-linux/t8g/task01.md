# 独立审查 Mail 恢复与 Linux 终端批准候选
身份：wta-ubuntu / t8g，Lead t3p，共享根为本文件上两级。工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration。
使用 dev-review，独立只读业务代码，禁止子代理，不修改实现，不跑重型验证。可写本目录 report01.md。
审查固定提交 f19affac（Mail 同地址恢复）与 fc38dc86（Linux Automations 批准），包含新增文件。依据 #8/#5 change 的 source/spec/design、AGENTS。读取 t4x/report12.md、report13.md；Mail 定向 12 项实测日志 temp/issue-evidence/huhu-2026-11-22/mail-separate-restore-check.log 在根仓库。
重点：恢复映射/重复意图/新旧账号与凭据隔离、普通用户可理解的独立恢复；Linux 批准的版本/目录/argv绑定、撤销与重复执行，保留 Windows 与本机普通启动。Agent/native 实现由 t86 正在写，不审查其动态工作树；launchApprovedShell 缺口已知由 t86补齐，不重复作为新发现。请评估接口契约兼容但勿假定已完成实际运行。
规格与规范两轴，报告确定缺陷附行号与证据，区分待验证风险。可只跑自己的单一受影响 Vitest 文件，不跑 E2E/typecheck/构建。记录未验证。完成原子发布报告，回告 t3p；HC不可用则留报告即可。
