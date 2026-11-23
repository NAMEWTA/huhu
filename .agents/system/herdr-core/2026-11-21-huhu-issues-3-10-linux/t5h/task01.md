# task01.md #7 SSH 本机 PTY 生命周期与进程归属分析

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 当前任务 — `t5h/task01.md`，本机 `wta-ubuntu` 默认 Core
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report01.md`
- Lead — `t3p`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`，当前集成树，只读。确定并记录所查提交。

## 交付

对 `t4t/report01.md` 已确认的 H5.4 P1 做具体可实施设计。0.1.19 Unix holder 明确允许主动离开 PTY 的进程继续，SSH 的 Vault 生命周期 A17 又要求释放旧本地运行。检查是否有 Herdr 发行合同／局部进程树开关、Huhu 已有受管启动、操作系统所有权机制或成熟依赖支持。分别给 Linux、macOS、Windows 的结论和可落地顺序。需要 Linux 上真实存在而且适于当前桌面启动方式的能力和限制。优先复用 `temp/sources/herdr-core` 和项目记录，明确本机参考 checkout 和随包协议的版本差异。说明正常关闭、丢失回复、发起中的关闭、Engine 崩溃后复启、只读 Vault、同机 Agent Core 及同名 Vault 的归属证据。

给出两项独立可测试设计。一项针对已拥有的 Core/holder 和 run 标签，能在窗口 15s 退出预算内对账回收；另一项针对拥有确证的已脱离后代，含隔离、重复调用、PID 重用、环境清空和宿主回退。不能靠全局进程名或无归属匹配结束进程。提供最小拟改文件、正常和故障的真实夹具断言、仍未能证明的边界。无需重做 `t4k` 或 `t4t`，复用它们的已收报告。

## 读写与验证

- 只读业务、测试、发行源码和本机环境。只允许写当前同号报告与同目录临时稿，不修改程序、工作树、Core、系统服务和 Git。不停止任何进程。可查 host 能力的只读命令及本机实际二进制版本。
- 不使用真实 Vault、凭据或 Agent 历史，不跑 E2E、构建、全量测试或重型门禁。不要再派发、不写远端。
- 按 Core 文件协议核对身份、topic、manifest，发布报告并回告 Lead。失败说明事实。

## Lead 验收

由 Lead 复核填写。
