# WP3 · 评论锚点与权限

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w3`，分支 `closeout4/wp3`。先读 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。
归属：`plugins/notes/src/engine/comments/*`、`packages/editor/src/host/routes/comments.ts`、`packages/editor/src/rich/comments.tsx`、vendor `app/src/comments/*`（需登记补丁）、NotesModule 中评论只读参数一行、相关测试。
范围：D04（同偏移也核上下文，无法唯一归属则孤立；复核给出的「甲：同句／乙：同句」反例；格式变化与同分候选；已存在锚点在格式/表格/链接改写后）、D05（发起时冻结文件身份与 revision，持久化前映射或要求重定位；flush 在途继续编辑）、D02（只读 Vault：线程可看可定位、写操作禁用；规格 §8.1 Markdown/引用呈现与固定 OK 字面显示冲突 → 列入待用户决定，附两种实现的影响）、D01（取消后临时/永久标记与边缘按钮清零）、D03（双向激活滚动与 thread id、切视图后无遗留浮层与焦点抢夺）、R7。
