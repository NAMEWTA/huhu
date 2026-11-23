# 保存队列基线修复
Lead t3p worker t13b，工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux。
读取 AGENTS、dev-build、temp/final-audit/t136-report01.md 和 t12v-report01.md。按分析做最小连贯修复：同基线正常保存继续按 ACK 递进版本；load/merge/keepMine 接纳新基线后旧队列不得借新版本写入，迟到成功/失败不能覆盖新状态。字段操作冻结触发时交付的正文并沿字段差异重基等待快照，不能提前写后来输入。撤销到已落盘正文应 saved/hasUnsaved false，撤销到旧磁盘正文仍 dirty。保留明确保存只保存一次快照，自动保存/退出/操作依赖排空原契约。
Lead 已真实运行 t137 两基线回归失败、t138 撤销A失败/X通过、t139 档案字段快照失败。现有43测试不删不弱化。增加 keepMine 与旧成功 ACK 在途、字段跨基线等有意义时序测试；可利用已有门控。
唯一可写 plugins/notes/src/ui/documents/DocumentSession.ts、plugins/notes/test/document-session.test.ts、plugins/notes/src/ui/archives/ArchivesViews.tsx 的 writeFields 回调检查。其余文件只读，需额外范围报告 Lead。禁止 SSH、提交/reset、子代理。只写代码和测试，不运行任何验证；Lead 串行验证。
前端指南已有 search/retrieve：完整读取 /tmp/mwg-guide-3235787-1795365728802.md（396行）；分析者也使用 /tmp/mwg-guide-4-1795367557788.md。无需提权联网，不绕过权限。明确各 await 后的状态归属，勿扩成泛用基础设施。
报告 temp/final-audit/t13b-report01.md，列变更、边界、未运行验证，不 hc send。