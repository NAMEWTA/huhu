# task02：候选包 Gateway 边界用例独审
工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration。Lead t3p。
只读审查 tests/e2e/workflows/gateway-package-boundaries.spec.ts 与 scripts/accept-linux-candidate.sh 当前 gateway diff。核对真实用户入口、批量 stale policy 断言、缺 JS/CSS 404 和缺工作台 bundle503 的实际生产路径，尤其 rename 私有候选 app.asar 的有效性与恢复/清理。测试目前仅 types/lint通过（t198），尚未真跑，不算实际通过。
不编辑文件、不启动agent、不运行E2E/build/全仓检查。可定向读现有测试/候选helper/生产代码。报告 temp/final-audit/t194-report02.md；列具体阻断缺陷与验证限制，无真实问题不制造要求。
