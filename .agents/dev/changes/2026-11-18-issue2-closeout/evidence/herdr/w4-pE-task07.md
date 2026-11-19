# task07 · 复审最终候选 ce913d2

角色：独立审查（gpt-6.2-sol xhigh），只读业务文件。工作目录 `/home/wta/projects/huhu-wt-review`，`git checkout --detach ce913d2`（`closeout/issue2-integration`）。

范围：`git diff 3dbd420..ce913d2`（含新增文件 `scripts/check-ok-class-collisions.test.mjs`）及 `git log --graph 3dbd420..ce913d2`。
1. `eb21c5b`（w4:pJ，`w4:pJ/report01.md`）：H02 作用域化与守护——核对你在 report06 提出的 H02 阻断与应修（AST 判定、来源识别、`::backdrop`、A/B 登记）是否关闭；`:where(.ok-root, .ok-root *)` 是否改变 OK 区域内渲染（特异性、portal、伪元素）；新挂 `.ok-root` 的 portal 是否引入新的样式继承问题；P-H02-01 登记与重放。
2. `10f8dd6`、`f9dbed3`（w4:pH，`w4:pH/report02.md`；依据 pD `w4:pD/report05.md`）：prosemirror-view 补丁对 Home 后折叠光标的保护——与上游 1.43.0 `DOMSelState` 语义对照、无导航时光标恢复是否保留、IME / 销毁 / 非折叠选区路径；补丁源码 / ESM / CJS 一致与锁文件指纹；回归用例是否先红后绿。

**只做静态审查、读日志、可跑单个 vitest 文件；不要运行 e2e、构建、Electron 或全量测试**（Lead 正在同机跑最终门禁、G07、F09、全量 e2e 与打包，结果写入 `/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int11/`，完成后可读并纳入结论）。
验收：逐项是否成立、问题位置与影响、阻断 / 应修 / 可选分级，以及 Issue #2 是否还有阻断关闭的问题。回报 `report07.md`，manifest 中 w4:pE 改为 done。
