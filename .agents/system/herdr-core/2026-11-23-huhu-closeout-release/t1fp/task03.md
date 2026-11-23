# Pi 硬链接同源认领修复
身份 t1fp/task03.md，Lead t3p，目录 /home/wta/projects/huhu。实现 sol/high，无子 agent。
复核 t1g0/report02.md 中唯一 P3：两个硬链接指向同一 JSONL，不应允许各自恢复认领。修复 Pi 来源比较和 pending claim，让已证实相同 dev/ino 的文件共享占用；不同实际文件仍可并发。复用当前文件身份帮助函数（先搜索），避免额外基础设施，失败读取保持现有来源校验语义。补实际能力入口小回归并先红后绿，单个 agent-history.test.ts 可运行。
只写 index.ts、该测试及确需现有帮助函数；不得运行构建/E2E/全仓检查。完成冻结并报告 report03.md 或 temp/closeout-release/t1fp-report03.md。不扩展其他边界。
