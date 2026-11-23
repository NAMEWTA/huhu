# 非 SSH 剩余 Linux 平台实施边界
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Core wta-ubuntu，Lead t3p，执行 t5h，工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration。只读疑难分析，report08.md；不改业务、不派发代理、不运行测试/构建。
根据 report07 的事实、原始 #4/#5/#9 spec 和任务的支持平台约定，判定 Linux interactive-environment.ts 与 terminal-environment.ts 平台限制是否为本批次必须补的缺口，列明原始文字依据，不能将现实现支持范围当作用户缩减授权。若必须补，沿现有 POSIX 规则 helper、native-pty 和 Core attach，给出最小复用改动边界、调用链、必要真实子进程验证及需要变更的契约，强调普通环境与保护值独立。不涉及 SSH，不访问任何真实凭据或账号。
同时给出 T7.2 安装包“今天创建、明天执行”测试时钟最小接入方案，检查当前 Engine 可注入 opts.now 与实际 scheduler，需保证真实生产派遣路径、固定包执行、不可用 renderer clock 冒充 Engine clock。重点回答实现入口与验证手段，不重复完整计划。
