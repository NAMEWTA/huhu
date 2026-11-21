# task02 · #9 P8.3 保险箱整代 Git 候选

在 task01 已交付并写报告、工作树干净后开始。用原 agent-lifecycle 工作树从 4d86c84bc55169bf4faa05867bf6ff2863030b81 建立独立 impl/huhu-issues-3-10-safe-git，Mail 提交留原分支可独立合入。只编辑 plugins/versioning、plugins/safe 其 Git 快照接口和领域测试/证据。Engine/Vault 公共装配由 Lead；必要用最小测试装配，给出真实接线与后续验证。

先读 #9 P8.3/spec/design 和 t1bh/report09。复用 SafeStore 的写队列与当前备份集合、现有 VaultSync 临时 index 和 GitRunner.runBuffer。交付一个可证实的自动同步垂直切片：在相同队列下捕获 Safe 当前 keyring、manifest 与引用密文，预览按实际组选择，用户排除导致组断裂时清楚反馈。自动暂存不带审计、旧元数据或未引用旧代，核对真实 Git 对象中的路径及字节。保留用户自己的 index、工作区、旧数据和已存在历史。不要因当前没有版本就清理真实旧原件。可由源端控制或先拒绝不完整输出，不能假设普通筛选已能从 read-tree HEAD 移除旧树项。

按可用工期推进同一已验证整代的 Git 合并、冲突保留：双边 Safe 代不得逐行拼接，不返回假成功。能安全验证真实合并树时才发布；明确本任务覆盖自动同步范围，已跟踪的旧提交、手工 stage、回滚的实际余项分别记录。测试用 Windows 临时 Vault 和本机 bare Git 仓，还要覆盖 Safe 并发写、已暂存的不相关用户路径和出站实际树，无远端网络或真 Vault 写入。验证后及时提交独立切片并写 t1c2/report02.md。
