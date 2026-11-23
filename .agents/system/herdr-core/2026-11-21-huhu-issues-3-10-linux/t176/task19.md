# task19 同包 Web 修改后桌面旧正文诊断
Lead t3p；worker t176；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
仅只读诊断，不修改任何tracked源码（Lead正在固定b8f6c427包串行验收）。不要跑E2E/build/全仓检查，不启动agent。
失败 temp/final-audit/final-package-web-b8f6c427.log 第113行后；已保全 temp/final-audit/final-package-web-artifacts-b8f6c427 的trace和error-context。用例 tests/e2e/workflows/web-share.spec.ts:226。浏览器编辑已通过disk断言，桌面openNote后ProseMirror仍旧。核对真实trace、文档会话/事件/park恢复/最近迟到事件实现，提出最小根因与本地单测复现建议，区分驱动与生产；不猜测扩大改造。只在 temp/final-audit/t176-report19.md 写报告。此前notes32项通过，别重跑它们。
