# #5 T7.2 用固定 Windows 安装候选走通真实 Codex 的问答

- terminal_address `t19m`
- 固定代码 `40822efd63d80cdc1bcba1d0f9c7d1219aa5bbd1`，包 SHA-256 `3b9d72dd8da98add223243650986ad77a3ba5c50e2b9007e408a049ae1df7521`
- 解包程序 `C:/Users/cdewta/AppData/Local/Temp/huhu-40822efd-release-8c634516/win-unpacked/HUHU.exe`
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19m/report01.md`
- 先看 `t187/report13.md`、`D:/Document/code/huhu/temp/issue-baseline/packaged-codex-native-workbench.cjs` 和 `40822efd-packaged-smoke.log`

使用包内 Core、CLI 和原生 Codex 0.171.0，在隔离临时 Vault 和全新 provider HOME 通过本机 Responses 服务提供合成输出。分析实际 app-server 已启用的用户问答路径和工具选择，优先把当次真实原生请求经 MCP 创建或派遣、CLI 读取和回答，再观察原生进程续行、外部读取单一结果、桌面回到原 session、人工完结。固定 provider 为实际程序；模型推理由本机确定性夹具提供。覆盖重复回答、暂停未到期；自然次日跨日无法在当前包无损观察时，明确交叉引用已注入时钟的现有生产 Engine 定向用例。若真实用户问答 handler 受到产品配置或 provider 能力阻碍，给出精确复现、实际允许路径和最小接续，别伪造已通过。

仅写系统或共享主题临时脚本、日志、报告；产品、候选包、集成构建目录、其他 worktree 和根锁只读。不得启动真实账号、使用真实凭据、对外发送业务或修改系统时钟。外部代理限定本机回环，在退出前停止自己的临时 Core 与窗格。不增加 Git worktree。

