# #8/#9 模块凭据与备份联验复核

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 本机默认 Core `wta-ubuntu`，Lead `t3p`，审查终端 `t4v`
- 任务 `t4v/task03.md`，报告 `t4v/report03.md`
- 以当前已提交的 `a8bcd145` 为固定基线，工作目录 `/home/wta/projects/huhu/temp/issue-worktrees/integration`。按 Git 对象读取，避免查看同目录正在写入的 #7 草稿。

按 `dev-review` 与 `dev-verify` 的证据标准，对照 #8 Mail、#9 Safe/模块凭据 Issue、规格、调用者和现有测试，核对第二组联验可用的共同入口。必须串起干净安装默认关闭、按能力授权/撤销、Safe 锁定时 SSH 或 Mail 自有认证、新格式 Vault 数据包备份/恢复。记录能从同一候选顺序运行的命令、夹具和可观察判据，辨别已有真实验证、仅用例及候选缺口。优先定位任何目前会阻止该旅程的实现问题，给出最小复现与范围。可参考前序分支证据，明确原 SHA 与环境。仅读本仓与本机已准许的合成测试材料，不读取实际邮箱、Safe、密钥或历史。不运行 E2E、构建、打包或其他重型命令，不改业务代码、不写远端、只写同号报告。
