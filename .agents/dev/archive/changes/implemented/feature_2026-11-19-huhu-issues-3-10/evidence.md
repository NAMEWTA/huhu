# Huhu #3–#10 批次交付验收

归档于 2026-11-24。原目录为 `.agents/dev/changes/2026-11-19-huhu-issues-3-10`，主类型为 feature。批次收尾范围遵循 2026-11-22 的用户决定，包含 #3–#6、#8–#10。这七项均已完成并关闭。 [批次计划](program.md) · [最终交付与关单回执](../feature_2026-11-23-closeout-preview-release/progress.md)

- 预览版固定应用提交 `e14bc4c790c0afb6f5e75a25bbbb740a2202be25`。Linux 同包八组 15 项通过、零跳过。Windows x64 和 macOS Apple Silicon 补包各 4 项通过，各跳过 1 项 Linux 专属用例。 [发布记录](../../../../deploy/github/releases/2026-11-23-0.0.2-rc.1.md)
- Linux 全量单测初跑 2217 通过、7 失败、30 跳过。6 个非 SSH 失败经修正后对应文件复验通过。SSH 跳板修订断言仍失败。真实线上账号、第二台局域网设备和其他平台的用户实机验证保留为后续事项。 [最终制品回执](../feature_2026-11-23-closeout-preview-release/progress.md#最终制品与-issue-关闭)
- `f6c4e0d5` 的较早固定包证据及其交付范围见[非 SSH 收口记录](verification/non-ssh-final-delivery.md)。分支备份和恢复方式见[分支清理记录](branch-cleanup-2026-11-23.md)。

[#7 SSH](../../../../changes/2026-11-19-issue-7-ssh-module/plan.md) 保持暂停，原型、任务和恢复资料随活跃变更保留。
