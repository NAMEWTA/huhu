# task03 · G07：收件箱正文冷启动回退 +782 ms 的根因与修复方案

角色：疑难分析（gpt-6.2-astra high）。工作目录 `/home/wta/projects/huhu-wt-perf`（detached `f9f0186` = `closeout2/final`，依赖已装，未构建；需要时 `pnpm build`）。基线 `/home/wta/projects/huhu-wt-rc4`（rc.4 9132640）。可写：本 worktree 临时试验（不提交）、/tmp、本目录 report03.md。

## 现象（已实测，见 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/reopened/README.md` G07 节与 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/reopened/independent-review.md` 第 3 条）
`node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 10 --nav-only --frame-click`（含正文端点）：收件正文可见 配对差 +782.0 ms [765.8, 880.4]，10/10 更慢；正文 p50/p95 1485.7/1566.9 → 2282.6/2463.7；收件标题差 +11.1（不显著）。数据 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/g07-body-ab.jsonl`。rc.4 正文与标题同批渲染；候选在 `plugins/inbox/src/ui/InboxModule.tsx`（约 222 行）的 `Suspense` 中才加载 `CompactView`（OK 富文本 compact 变体，OP-D18 / H05）。
规格：G07「首屏与非知识库模块的冷启动指标对 rc.4 基线**无回退**」，编辑器闭包懒加载；H05 compact 变体要求输入/保存/@/撤销/IME 用 OK 编辑器。

## 要求
1. 拆分这 ~0.8 s：chunk 下载/解析、Lingui 目录、OK 样式、Tiptap/Yjs 初始化、首次 hydrate/settle，各自占多少（CDP 时间线，≥3 次）。
2. 给出不改变用户可见语义的修复方案并原型验证，例如：只读展示阶段先渲染与 OK 阅读输出一致的轻量静态预览、在用户聚焦/编辑时再挂载 OK compact 编辑器（需核对 H05 与 OP-D18 是否允许、输出是否等价，给出等价性证据方法）；或在不影响首屏指标的时机预取（需证明首屏 homeMs/homeDataMs 不回退）；或缩小 compact 闭包。评估每种方案对首屏、任务、收件箱正文、首篇笔记、H05 行为的影响与风险。
3. 用原型构建在同一驱动下测量：收件正文、收件标题、任务、首屏，与 rc.4 交错 ≥10 对（负载 <2，无其他 Electron/Playwright）；给出推荐方案、改动范围、验证清单，交实现会话。
负载纪律：w4:pK、w4:pM 同时在跑 e2e；测量前确认空闲并记录 uptime。
回报 report03.md，manifest 中 w4:pG 改为 task03.md done。
