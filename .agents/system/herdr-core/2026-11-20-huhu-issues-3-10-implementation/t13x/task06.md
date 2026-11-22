# #4 W6.3 与 #9 P4.1 Windows 独立复跑

终端 t13x，任务 task06.md，报告 report06.md。按优先级先复跑 W6.3 `77a52b6b2a7d92d41ef7fe1dd9a0b3f006d85c90` 的现有 Windows 固定 Core + 合成 App Server 原生回执测试，证据在 t135/report03.md。观察真的持久化后才回执、两阶段丢 ACK 时原件可重交、无额外输入或回答。然后复跑 P4.1 `f5a92e68df2ba655e9c888ddb9e61460cd69a4aa` 新增现有 Windows Engine + Git 合成回环 HTTP/HTTPS 使用路径，证据在 t12p/report05.md，观察 Safe 独立、远端切换、绝对清理和旧引用兼容。先写出 W6.3 独立结果小节并告知 Lead，再继续 P4.1。不创建 Git worktree，使用冻结 Git 归档与本地依赖，在系统盘一次性目录运行。只复跑既有正常验收用例，不做漏洞或绕过探索，不触碰真实资料、远端或本机 Git 配置，不改应用源码、锁文件或分支。报告实际运行结果，清理自己的验证窗格及一次性目录。
