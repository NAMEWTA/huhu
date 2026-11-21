# WP4 · 文件树、标签、列举与图标

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w4`，分支 `closeout4/wp4`。先读 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。
归属：`plugins/notes/src/ui/explorer/*`、`plugins/notes/src/ui/tabs/*`、`plugins/notes/src/engine/service.ts`（复制/隐藏规则存储部分）、`packages/vault/src/list.ts`、`packages/editor/src/host/routes/files.ts`、`packages/ui/src/components/FileIcon.tsx`、`packages/editor/src/rich/at-reference.ts`、`packages/workbench/src/command-palette/CommandPalette.tsx` 图标一行、vendor 文件树图标（登记补丁）、相关测试。
范围：E04（按 index 路径统一 remap/prune 档案与文件标签；外部改同一文件两边一致）、A06（空白区根菜单；受限行三入口同一禁用原因；多选右键保留选择）、A07（复制走 OperationLog；非 MD 回收恢复；越界写操作字节不变）、A10（受保护标识贯穿行/菜单，受保护 .md 走受限元信息；显式开放目录的外部权限）、OP-D10（取消未授权的 .DS_Store/Thumbs.db 强制过滤或改为显式偏好——若认为应保留过滤，列入待用户决定；祖先 symlink 循环；Unicode/空格/大小写夹具）、OP-D11（隐藏规则改用每 Vault stateDir/类型化偏好，迁移已落盘规则；外部改名行为）、F06/OP-D13（树、标签、@、搜索、详情共用一张图形表，补压缩包）、A01–A05、E03 的缺验证项、F01（关闭重开 TXT/JSON 一致）、F03（PDF 真实拖选文本、切换后恢复页码/缩放/滚动）。
