# 紧凑编辑器已诊断失败的最小修复候选
Lead t3p；worker t10g；wta-ubuntu。共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux。
工作树 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，基线4ae7e7e4。t10d同树只写Mail；t10f同树只写native-receipts.live测试；互不编辑对方文件。不git add/commit，由Lead收diff。禁止修改integration，它正跑固定候选全量E2E。
先读 t10c/report01.md 的诊断（共享根下），用dev-debug/dev-build；客户端修改先完成zh-modern-web-guidance search/retrieve并记录依据。当前只写不跑验证（包括不启动app/E2E/构建/typecheck/单测/install），不启其他agent。
可写：packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/wiki-link.ts；tests/e2e/knowledge/compact-inbox.spec.ts、compact-submit.spec.ts、editor-compact-commands.spec.ts。若需额外文件先给Lead理由。共享upstream ledger不改，只在报告列需登记的来源/补丁，Lead唯一编辑。
1 G07产品导航回归：既有base href=/使location.assign('#/...')从/index.html跳/而重载首页。复用同文件资产支路location.hash方案保留pathname/query与现有编码，不能改全局base或绕过真实点击。E2E保留原节点、复制MIME、目标正文断言，加document实例/URL观测证实同文档导航。
2 H05三项原测试前提过时：共享Y.UndoManager可同步撤销source，现测试在提交之前失败。按诊断用真实普通编辑制造DOM与source分歧，并保持两种发表入口的连续双击、taskId/正文唯一请求、重开、完成状态。撤销到空的零提交继续覆盖，另用真实删除到空制造source未结算的零提交；不得强写Y.Text或移除分歧见证，仅放宽断言不接受。helper若需变更先报告Lead，不改所有调用方。
3 OP-D18现有点击可能命中原子wikiLink。只准备精确文字坐标点击（Range只测量，真实鼠标和键盘），添加逐键焦点/DOM选区与PM选区取证保留原语义。不改产品键盘逻辑，因尚无证据。若代码观察无法确定最小准备方式，给Lead明确诊断补丁和待跑步骤。
读integration/test-results相应trace只读。仅写候选，不声称修复已验收；本次E2E417条仍在跑，之后Lead定向复验。
报告本树temp/final-audit/t10g-report01.md，注明修改、未运行验证、需Lead复跑用例与现代指南来源。若hc send权限不足直接留报告，不申请扩大权限，Lead会主动读取。
