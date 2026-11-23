# #7 H3.3 出站代理与受控中继的复用分析

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 本机默认 Core `wta-ubuntu`，Lead `t3p`，分析终端 `t5h`
- 任务 `t5h/task03.md`，报告 `t5h/report03.md`
- 固定代码基线 `e71f47b0dedd323a69c4861f6bc808a450603e44`，工作目录 `/home/wta/projects/huhu/temp/issue-worktrees/integration`，通过 Git 对象只读核对。

按 `dev-architecture` 核对 #7 H3.3 R04/R05、A03 与 #6 意图和授权合同。检查当前 ssh2 Manager、Vault/设备凭据模型、跳板 routeRevision、CLI/MCP 正常入口及现有依赖，并逐文件对照 Motty 固定 v0.4.12 的出站代理、ProxyCommand、ViaShell。给出可独立交付的第一片，具体说明 SOCKS5 与 HTTP CONNECT 是否可复用当前依赖，继承/直连/覆盖和代理账号应落到哪层，路由版本如何区分改变，工作台已有连接与外部请求如何持有各自授权，失败与代理运行位置如何出现在现有时间线。识别导入文本及外部输入到本机命令执行的边界，给出本机显式配置且默认关闭、与远端 shell 中继各自独立的最小生产合同与回环验证方式。请按真正的调用代码、依赖与上游依据提出三跳验证，避免重做现有路径；列文件、固定提交、许可证。先读资料和代码，无需启动实际命令/SSH、运行测试或修改业务代码。不要派发、不要写远端，仅同号报告。
