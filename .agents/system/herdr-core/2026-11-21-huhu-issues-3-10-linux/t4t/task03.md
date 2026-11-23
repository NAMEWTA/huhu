# 复审 #7 用户证书与 #3 关窗回执

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 本机默认 Core `wta-ubuntu`，Lead `t3p`，审查终端 `t4t`
- 任务 `t4t/task03.md`，报告 `t4t/report03.md`
- 固定基线 `891ddd8ac41185180543a84cb2b6aadf280ee33e`，目录 `/home/wta/projects/huhu/temp/issue-worktrees/integration`

按 `dev-review` 对源码、规格和定向日志做独立复审。首先聚焦 `c4281b1c`、`e71f47b0` 的 ssh2 Ed25519 用户证书。核对证书配对及发包、现有裸钥和 hostbased、信任路由、工作台新身份路径和外部主体输入限制、凭据和证书暴露、大小与取消。真实 OpenSSH 日志 `temp/issue-evidence/huhu-2026-11-22/h7-user-cert-openssh.log`，区分库发包与 Huhu 实际入口。其次 `891ddd8a` 对 #3 TB-14/15 的保存成功、草稿和无法确认。重点检查可信 frame 与请求事务、本机临时回执与重开、OS 通知不可用的路径，以及合并关窗与退出时实际是否会漏发或重复。最后对 `bb7b9b6a`、`6f1b6cd3` 快速核对上一轮的两个问题是否已修复，并标记你认为仍需复查的具体复现。已有设备待验与首次关窗时钟范围仍按原任务跟踪，无需重述长清单。

只读固定 Git 对象、相关规范、测试源码和本机日志。仅写同号报告，列严重度、可重现条件、可能副作用、最小验证入口。无需运行 E2E、构建、打包或重型验证。无其他派发和远端写入。
