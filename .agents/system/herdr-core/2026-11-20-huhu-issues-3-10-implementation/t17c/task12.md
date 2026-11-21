# #4 W8.1 恢复数据包后的 Space 目录

- terminal_address `t17c`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 新分支 `impl/huhu-issues-3-10-agent-space-package`，以 `0c96c27b844a580178a4d6f24f1d6bb987eba4e7` 为基线
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report12.md`

实施 W8.1 的 Space 目录语义。此次选用本机 Core 布局留在原 Vault 运行区，数据包保留业务配置。包恢复至新目录时，Vault 根及仍存在的库内相对目录绑定恢复目的地。外部目录必须由用户重选，在 UI 上明确显示待绑定且不能启动。普通同机重开与当次布局不变。确认恢复不隐式启动；旧目录、符号链接或穿越不能逃逸到源 Vault。优先现有实现，不改其他运行期目录或原生历史。已有绝对目录的同机行为尽可能保留；恢复或同步数据的早期未知状态须保持安全。

请只改 plugins/agent-cli 的 SpaceStore、专属共享类型／测试，以及 README/计划或 #4 证据。若需要有绑定场景的 UI，可以修改独立组件文件，公共 Engine index、AgentCliModule、包收集器和桌面装配仍归 Lead。报告给出最少装配点与可以直接复验的备份测试；新模式使用现有 .huhu runtime 排除。不要写入真实 Vault、其他机器、远端、根锁文件或额外 worktree。前端改动需完成现代 Web 指南的 search/retrieve。

