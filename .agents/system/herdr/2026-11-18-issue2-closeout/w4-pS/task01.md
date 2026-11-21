# WP2 · 属性、YAML 与大纲

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w2`，分支 `closeout4/wp2`。先读 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。
归属：`packages/vault/src/semantic/frontmatter.ts`、vendor `core/src/frontmatter/*`、`core/src/bridge/bind-frontmatter-doc.ts`、`core/src/extensions/frontmatter.ts`、`plugins/notes/src/ui/NoteInspector.tsx`、属性面板接线、相关测试。
范围：OP-D17（只留一个 YAML 编解码，双方委托同一纯入口；`zip: 007` 分歧样本）、C03（BOM、CRLF、二者组合在属性面板改值后全文字节保真）、C01（详情显示与编辑同一属性视图并与顶部同步；阅读模式显示只读属性；BOM 样本）、C02（SP5 期望值固化、非完整日期编辑相邻属性不变）、B10（大纲来自解析树真实 heading 与源码位置，排除围栏与 YAML 注释的伪标题，跳转正确）、R8。
