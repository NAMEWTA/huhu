# t176 task01 — 当前组合界面失败只读诊断
Lead t3p。工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration，固定 HEAD 4a54f0a9。先读 topic.md/manifest.tsv 和项目 AGENTS，使用 dev-debug。无子代理。
只读业务及测试文件；唯一可写产物 temp/final-audit/t176-report01.md 和本目录 report01.md。当前 Lead 正在 t174 串行 E2E，禁止改文件、E2E、构建、全仓门禁、安装依赖。不要触碰 SSH。
读取 temp/final-audit/followup-failed-4a54f0a9.log 和 followup-failed-artifacts-4a54f0a9 的 trace/error-context，定位三个非性能失败：shell.spec.ts 自动化 Agent Tasks 完成后 resultView 不含结果；workflows/acceptance.spec.ts W05/W06 西侧日期任务按钮缺失；Agent 设置初始 已检测 文本与实际版本文本差异。区分真实产品回归和夹具不符。沿真实调用路径核对实现与 UI，必要时解压 trace 读状态。给出根因证据、精确文件行号、最小修复建议和保持原验收语义的复验方案；不要为了过测改期待或降低断言。
前端相关先读 zh-modern-web-guidance，可复用 /tmp/mwg-guide-742470-1795376192756.md 完整 js 指南及已完成检索证据，需要其它主题按 search/retrieve。
报告单列未运行验证，产物后 hc send t3p 报告路径。此任务仅分析，不实现。
