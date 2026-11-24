# task02 · B06：浏览器先复位、用户随即 Ctrl+Home 的时序

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-pm`，分支 `closeout3/b06`（= `closeout2/final` f9f0186，含你的 ed092e4）。提交，不推送。

依据：独立审查 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/reopened/independent-review.md` 第 4 条：若浏览器在观察器处理前已把 DOM 光标折叠到文档起点，随后 Ctrl+Home 不再改变 DOM 端点，补丁判定为无导航，仍可把光标写回旧模型位置（静态推导，`patches/prosemirror-view@1.41.8.patch` 约 257、292 行）。
要求：在真实 Electron 中构造该时序（重新聚焦→浏览器复位到起点→在观察器处理前按 Ctrl+Home / Home），断言 PM 与 DOM 最终都在起点、随后 Shift+End 选中首段。先判红；能复现则修补丁（对齐上游 1.43.0 DOMSelState 语义：导航键本身作为本次聚焦后的用户意图，不仅依赖端点移动），源码/ESM/CJS 一致、指纹、R-53、notices；不能复现则给出插桩时间线证明该顺序下观察器路径不会写回。验证同 task01（零重试）。
负载纪律：w4:pG 在测量，w4:pK 在跑 e2e；e2e 前确认空闲并记录 uptime。
回报 report02.md，manifest 中 w4:pM 改为 task02.md done。
