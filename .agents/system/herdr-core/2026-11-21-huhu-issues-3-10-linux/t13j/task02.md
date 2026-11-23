# 修复真实 TipTap 停放回归
Lead t3p worker t13j，agent-linux。task01 Lead已运行t13k：首次隐藏后 revokeObjectURL已调用，1失败6跳过，证实独审。日志 /home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/snapshot-parking-red.log。
现授权按报告最小方案修生产实现。可写 packages/editor/src/vendor/open-knowledge/app/src/editor/EditorContent.tsx、components/snapshot-url-pool.ts 及 task01三份相关DOM测试；必要时 editor-cache.ts 中现有销毁回调接线、PATCHES.md对应记录。不得修改 Notes/HTML/Mail、重放文件、E2E，不提交/reset、不跑任何验证、不派子代理。
复用真实 editor 停放/重接/换绑/destroy 所有权，保证只在真正最后消费者结束才释放；停放树里的图片src变化/移除也正确回收。避免无限强引用停放树或用延时掩盖。保留现有35项语义、容量约束和异步取消。实际生产有owner替换/缓存销毁入口需追查后闭环。补有意义反例（隐藏后真正关闭、移除节点或换源、重复停放）不强造无关基建。
现代web沿用task01完整指南。完成写 temp/final-audit/t13j-report02.md，禁止hc send，由Lead收取并串行测试。
