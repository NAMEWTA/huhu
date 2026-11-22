# task01.md 修复 #6 安装失败后的能力名称占位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t5r
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t5r
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t5r/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t5r/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 实施目录 — D:/Document/code/huhu/temp/issue-worktrees/capability，分支 impl/huhu-issues-3-10-capability，基线 cc736e5fbdead615b4d49fa147969f8f86ea4076。

按 dev-build 解决 `t4x/report01.md` 新复现的 P2。通过正常 plugins.install 让合成扩展在激活时抛错，验证清理及随后另一无关扩展可在同一 Engine 安装原来尚未有效登记的能力名。成功安装、停用、卸载、同一插件复装、运行中的 canonical/MCP 名冲突保护保持。不要误释放已通过安装的历史归属，不要让并发的另一插件在失败回滚之间接管仍活跃的名字。复跑 G2.1 的两个 Vault、默认关闭、单项授权、坏策略文件保全和 HTTP／CLI／MCP 共用判断。

允许修改 capability worktree 内 #6 的 Registry 和扩展生命周期相关文件、必要 Engine 装配、对应测试及报告。Engine 装配这一轮唯一写入者为 t5r。已冻结的 G1.2/G2.1 三提交保持不变，追加本地修复候选。只使用 Windows、独立测试 Vault、回环与合成扩展。禁止新建 worktree、改原工作区或根锁、远端写入和自行派遣。新链接检出需时，可在本目录用项目锁定的 Windows pnpm.exe 执行 frozen install。记录红灯、绿灯、固定 SHA、可复现命令及仍未测范围。
