# 最终验收覆盖独审（只读）
身份：Lead t3p；执行者 t10b；本机 wta-ubuntu；共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux。
工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration；固定 HEAD/main/feature 均 4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030。
遵循 dev-review。只读代码和文档，不改实现、不跑测试/类型检查/构建/安装/GUI，不开子代理。唯一可写本目录 report01.md。Lead 正在 t109 跑唯一一次全量 E2E，不能打断。
目标：依据 program.md 及 #3、#4、#5、#6、#8、#9、#10 的 source/spec/plan，核对当前实际 E2E 与单元证据的覆盖。找出尚未落实的明确要求或最终验收必要缺口，避免重做既有审查；SSH #7 用户明确暂停，不审、不要求修复它。
重点：三组组合场景是否有当前真实入口覆盖；逐 Issue 最终报告需要哪些实际用例证据；新功能是否只有定义或未使用的用例。全量跑完前不得把 pending 视为通过，不把历史 Windows 报告当本轮 Linux 通过。
输入：.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/program.md；evidence/linux-final-gates.md；tests/e2e/workflows/{task-journey,web-share,mail}.spec.ts；tests/e2e/agents/linux-environment.spec.ts；tests/e2e/packaged/packaged.spec.ts；其余相关用例按需要查。
运行日志 temp/issue-evidence/huhu-2026-11-22 在根工作树 /home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22。t109 当前候选包与源码混合全量；packaged credentials 另由Lead执行。注意全量 Vitest 2项SSH失败保留，Engine坏环境测试修复，CLI ECONNRESET无法复现（原用例、完整文件、Engine/CLI68组合均绿），不掩盖该风险。
输出：逐 Issue 紧凑覆盖映射（源规格→具体用例/证据）、真正阻碍完成的缺口及代码位置，区分实现缺陷/待运行/平台限制。没有新问题也明确说明检查范围。报告先写临时文件再原子发布 report01.md，hc send t3p 回告路径。
