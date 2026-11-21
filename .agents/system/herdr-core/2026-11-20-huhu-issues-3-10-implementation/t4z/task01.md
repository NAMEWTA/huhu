# task01.md 独立审查 #9 模块凭据与 #10 Widget 贡献

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t4z
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t4z
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 工作目录 — D:/Document/code/huhu，业务与用户未提交修改只读。两个候选的原工作树已回收，使用 Git 对象。用户要求最多四个 worktree，本任务不新增 worktree。

按 dev-review 对两个已冻结小切片分别给规格轴、规范轴签收建议。先审 #9 P0.2 `7174fc8d59693575cbc16227ec296acdd4c219e5`，实际变更和新增文件从 Git 对象读取。核对独立凭据生命周期、Vault 绑定与震荡重试、失败顺序和并发、Safe 的隔离、合成密钥读取与意外退出。原 `t1b`、`t25` 报告留在共享根，Windows 凭据夹具从原 credentials/temp 移到 D:/Document/code/huhu/temp/issue-baseline/credentials-evidence。系统凭据驱动装配和最终备份在后续，指出本候选真实缺口。

再审 #10 W03-01 `15403bd772d65ae486688ffca821b271dde50605` 相对 `0cda9b407f15dffc2d4fcb20fdd7387ba12485ad`。读 `t3b/report01.md` 及计划。核对登记信任边界、实际 SSH 组件/清单/同源 Schema、停用和权限下降，留意普通结构对象或嵌套配置漂移，以及接入 W02-02 的输入。桌面实际版本 44.9.1 / Chromium 152.0.7977.167，只在 Windows。按证据区分本片和 W06 正式接线。

禁止远端写入、改业务源、自行开 worktree 或派遣。使用 git show / git archive 按 SHA 阅读实际新文件，必要时只解包与检查相关的最小文件集到一次性目录并复用集成检出的已锁依赖。测试使用隔离 Vault 与合成资料，严禁真实模块凭据或历史。报告非覆盖发布。
