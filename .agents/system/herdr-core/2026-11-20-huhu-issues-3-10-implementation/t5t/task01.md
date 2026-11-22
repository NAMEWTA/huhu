# task01.md 修复 #9 P0.2 材料回收与并发取用

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t5t
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t5t
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t5t/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t5t/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 实施目录 — D:/Document/code/huhu/temp/issue-worktrees/credentials，分支 impl/huhu-issues-3-10-credentials，基线 7174fc8d59693575cbc16227ec296acdd4c219e5。

按 dev-build 解决 `t4z/report01.md` 中 P0.2 的 P1 和 P2，用同一输入证实父提交确实失败。复制实例仍有其他待重配条目时，已重新绑定后清空的实体应释放已无引用的本机材料。对丢失原本机快照、文件损坏和身份无法证明保持保守，原实例经新配置操作后仍可使用。核对实际 Vault 进程所有权和规格对只读的约束，处理独立只读进程取用与持锁写者回收的竞争。可用跨进程保全或从私有合同及门面落实已有唯一写者的取用约束，按代码直接调用方和规格解释并测试其行为；避免添加权限范围外的静默注册或共享秘密。复跑已知四个异常退出窗口及并发版本保护。

允许编辑 credentials worktree 内 packages/kernel 私有凭据实现与相关测试、必要的纯保护原语和原语自身测试、上述报告。Engine、Renderer 装配、插件注册、Vault 包收集器、根锁和公开能力本轮由其他所有者管理。不要自行切换消费者或加入本机依赖。需要本机测试资料时用 `D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/` 的 Windows 独立合成夹具。禁止新建 worktree、改原工作区、远端写入、真实凭据、历史或自行派遣。仅 Windows，保存实际失败和通过的版本、SHA、命令与证据。
