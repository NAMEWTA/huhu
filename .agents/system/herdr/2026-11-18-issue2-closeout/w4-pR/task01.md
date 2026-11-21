# WP1 · 文档会话、保存与释放

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w1`，分支 `closeout4/wp1`。先读 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。
归属：`plugins/notes/src/ui/documents/*`、`plugins/notes/src/ui/NotesModule.tsx`、`NoteDocument.tsx`、`plugins/notes/src/ui/viewers/HtmlPreview.tsx`、`TextFileView.tsx`、相关测试。
范围（复核条目）：OP-D03（最后引用仅在成功 flush/草稿确认后销毁，双写失败保留可重试会话；保存前无意规范化门禁 markdownSemanticallyUnchanged 的适用方式；停放引用所有权断言；300 ms 防抖与当前微任务实现的差异——若认为现实现更符合用户利益，列入待用户决定，不自行改规格）、A08（按注册表与路径前缀结算所有相关会话含 TXT/JSON 和后台标签）、B09（切模式前统一 flush 及各方向切换、迟到结果隔离）、C04（属性→正文倒序竞争）、C06（只读、正文写失败、外部移动/删除）、F04（仅 flush 成功才进预览；UI 编辑后预览显示新内容；迟到签发）、F02 外部修改冲突的真实结果、F10 迟到请求不覆盖新视图。
