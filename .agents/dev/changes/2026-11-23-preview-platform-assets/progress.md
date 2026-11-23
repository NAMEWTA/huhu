# 补齐预览版 Windows 与 macOS 附件

用户要求将 v0.0.2-rc.1 的 Windows/macOS 与 Linux 同步发布，并明确使用 GitHub Actions 构建。沿用现有标签 e14bc4c790c0afb6f5e75a25bbbb740a2202be25，不移动标签、不拿旧版制品改名。

旧 v0.0.1-rc.4 已有 win32-x64 exe 和 darwin-arm64 dmg。当前 tag release run 45126902160：Windows typecheck 成功，全量测试 2124通过、27失败、103跳过，未进入打包；macOS15尚未分配runner；Linux typecheck步骤取消。原始日志保存在 temp/cross-platform-release，保留原CI结论。

新增手动补包入口仅证明固定标签的构建和包内 E2E，不替代原完整 CI。需要 Windows/macOS 两份附件实际上传并核对大小与摘要，合并 Linux 的原SHA256SUMS后才算完成。实施者 t1gn，具体见 .agents/system/herdr-core/2026-11-23-platform-release/。
