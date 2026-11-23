# task18 Chromium 显式 feature 参数修复
Lead t3p；worker t176；共享根沿用本目录；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
读取 temp/final-audit/t17c-report15.md 的低项。仅修改 apps/desktop/src/main/chromium-compatibility.ts 和 apps/desktop/test/chromium-compatibility.test.ts：按锁定上游语法正确识别 Feature.Group:params 和分隔前空白，保留原始列表和显式用户选择。先定向失败再修复，只跑该单个 vitest 文件及相关静态检查，不跑 build/E2E/全仓检查，不提交，不启动其他 agent。不要触及 SSH 或其他代码。
报告 temp/final-audit/t176-report18.md，写明依据、测试、未运行验证。向 hc send t3p 回告。若共享报告可写同时写本目录 report18.md。
