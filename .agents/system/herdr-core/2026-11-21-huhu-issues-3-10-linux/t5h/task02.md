# task02.md #7 H3.1 OpenSSH 证书接入选型

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 当前任务 — `t5h/task02.md`，本机 `wta-ubuntu` 默认 Core
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report02.md`
- Lead — `t3p`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`，按 `196cfbc6` 固定读基线

## 交付

对 #7 H3.1、H05–H08 的 OpenSSH 主机 CA、用户证书和关联认证证据做独立技术选型。核对锁定 ssh2 实际握手算法、私钥和 agent 用户认证入口、Huhu 现有 per-hop host verifier、known_hosts，及 `temp/sources/motty` 对 CA、revoked、通配和端口处理的原始实现。先查已有可用机制。不要求重做旧格式迁移，不放松 changed-key、可信来源、拨号前当前路由和外部资源归属边界。比较真实可选的单 SSH 连接池方案与少量上游适配方案，查清普通 TCP、跳板 forwardOut、Shell/SFTP/转发性能及审查边界。报告必须指出实际可以实施的最小兼容切片、不能证明的项目、平台测试夹具及许可证和版本。

## 读写和验证

- 按 dev-architecture 核对实际代码和固定版本。只读业务源、安装依赖、可用参考源码、发行文档。只允许写当前同号报告与同目录临时稿。需要技术资料搜索时使用原始上游文档和代码。
- 仅使用测试夹具，不访问真实端点、旧 Vault、真实凭据或 Agent 历史。不要发起攻击或构造绕过载荷，不跑构建、E2E、全量门禁，不新增工作树、不推远端。
- 核对本轮 Core 身份、manifest、已验收 task01 报告与当前文件指针。同步回告报告路径并如实记录投递限制。

## Lead 验收

由 Lead 复核填写。
