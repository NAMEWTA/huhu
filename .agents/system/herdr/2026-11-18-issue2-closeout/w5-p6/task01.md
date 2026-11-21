# D02 · 评论正文与回复渲染 Markdown 与引用（用户决定）

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w3`，分支 `closeout4/d02`（= closeout4/final 2f7d59c，依赖已装）。通用要求 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`；测试纪律：全部改完再跑一次定向 e2e，只重跑失败项，不跑全量、不测性能。

依据：用户决定 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/user-decisions.md`（D02 按规格 §8.1 渲染）。规格 `.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/source-issue-2.md` §8.1（约 342 行）与 spec D02。现状见 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p3/report01.md`：vendor `app/src/comments/ThreadCard.tsx` 约 397 行按字面显示。

要求：
- 评论正文与回复渲染 Markdown（强调、行内代码、链接、列表、代码块）与引用块；复用已有安全的 Markdown 渲染（优先用 OK 同一 schema 的只读渲染或项目已有的消毒管线，不新增依赖除非必要）。磁盘中评论原文不变。
- 内容安全：`<script>`、`javascript:` 链接、事件属性、外部图片自动加载等不得执行/外联；链接点击走宿主外链策略。
- 编辑框仍为原文；只读 Vault 下照常渲染。登记 vendor 补丁、刷新重放。
- 测试：单元（渲染与消毒负例）+ Electron e2e（发表含 `**bold**`、`> quote`、链接、恶意 HTML 的评论与回复，断言 strong/blockquote 节点、无脚本执行、磁盘原文字节、关闭重开后仍渲染）。
- 门禁同通用要求。回报 report01.md，manifest 中 w5:p6 改为 task01.md done。
