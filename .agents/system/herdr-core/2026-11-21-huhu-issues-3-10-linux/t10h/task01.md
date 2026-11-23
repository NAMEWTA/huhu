# 最终联验用例独立审查
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux；Lead t3p；worker t10h；机器 wta-ubuntu。
工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux。基线4ae7e7e4，其他工作者在此树写Mail和compact用例，禁止修改、暂存或提交任何业务/测试文件。
审查未提交的 plugins/agent-cli/test/native-receipts.live.test.ts、tests/e2e/workflows/web-share.spec.ts、scripts/accept-linux-candidate.sh。任务分别补CLI-only/MCP-only独立创建编辑派遣回答读结果，以及同一AppImage Web深链接刷新、桌面双向编辑、邀请和关窗布局重开。阅读调用方契约及existing helpers，找确定性测试错误、虚假成功/漏验、资源清理问题，准确报告行号和最小建议。区分仅待运行风险，不要求扩大验收范围到本次未承诺场景。
全量E2E t109正在冻结integration运行。禁止任何测试、typecheck、build、install、E2E或重型验证，只读静态审查。禁止子代理。不得修改integration。
只可写 temp/final-audit/t10h-report01.md，以临时文件后原子发布。报告含范围/结论/问题/未运行验证。不要执行hc send（沙箱会请求权限）；完成后停留即可，Lead主动读取报告。不要申请扩大权限。

Lead追加只读范围：tests/e2e/knowledge/editor-s3-properties.spec.ts 中F02旧编码预览确认流程小diff，核对现有EncodingConversion组件，禁止运行。
