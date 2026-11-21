# task14 · #7 H11 / #6 G5c 外部 SSH 资源和信任的可核验入口

以前一工作树 impl/huhu-issues-3-10-ssh-file-follow 的 295c052b 为已交付边界。确保旧任务已报告、树干净后单独提交本项。只写 plugins/ssh、SSH 专属测试和 evidence。共享 Engine 和 Gateway 由 Lead 装配。先读 #7 H11.1/H11.2/H11.3 和 #6 D24、G5c.1/.2、spec 与 task13 报告。复用现有 host/route/connection attempt/prompt/shell/SFTP/queue 的状态、注册方式和故障契约，按真实 scope 最小开放。先落 H11.1 静态描述、脱敏只读资源和身份版本化信任待答。根据实际验收安全推进 H11.2 作业输出/游标和 H11.3 入口一致性。每个可独立验证切片及时提交，列出需要 Lead 的注册。

只读目录不得发起 SSH/SFTP、凭据读取或新进程；外部默认关闭，使用当前授权和稳定对象 ID；实际 mutation 必须由专门授权且绑定原连接、版本、目标 id、待答提示和主体，按真实撤权结果返回。changed-key 保持专用核实边界。不可复用一个主体的回执/授权替代另一个，禁任意透传权限或受保护凭据引用。先复查既有脱敏字段及当前 Workbench 桌面/Web 的权限边界，保留现有运行/传输逻辑。交付确认具备的能力，不假称 SCP/sudo/Zsh 实证。

Windows 隔离的实际 Engine、CLI、MCP 与回环 SSH 夹具。涉及前端仍先运行现代 Web 指南 search/retrieve。不用真实账户和远端主机，不写根锁、集成、origin，也不留不用的子测试 pane。写 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report14.md，记录 SHA、Windows 测试、留项和接口。
