# #7 主机 CA 策略与真实 KEX 独立审查

- 共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Core wta-ubuntu，Lead t3p，终端 t4t
- 任务 t4t/task05.md，报告 t4t/report05.md
- 只读目录 /home/wta/projects/huhu/temp/issue-worktrees/integration，固定候选 84d19cb8cb180c2daa28ad2d5964f2729e196d49

按 dev-review 独立审查 H3.1 主机 CA。检查完整 wire K_S 参与 KEX H，叶签名和证书 CA 签名职责，默认协商是否受影响，已配置的证书规则是否堵住裸密钥降级，换钥与 rekey 是否漏验，已知 pin、撤销、地址与端口模式的优先级，以及批准的写入权限和版本阻塞情况。检查桌面共享外部入口是否存在越权。

目前证据 h7-host-ca-check.log 与 h7-host-ca-recheck.log。真实 Linux OpenSSH 重协商、错误 CA、叶钥撤销及定向权限测试已经通过。只核对固定 Git 对象、证据和主源规则。指出具体问题和最小验证手段。只读、不做真实远端连接、不写利用代码、不启动测试或构建。未验收的其他算法、KRL 和桌面实际操作不作通过结论。无远端写入。
