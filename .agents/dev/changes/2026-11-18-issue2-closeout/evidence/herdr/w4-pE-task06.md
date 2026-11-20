# task06 · 复审最终候选 3dbd420

角色：独立审查（gpt-6.2-sol xhigh），只读业务文件。工作目录 `/home/wta/projects/huhu-wt-review`，`git checkout --detach 3dbd420`（`closeout/issue2-integration`）。

范围：`git diff e85d281..3dbd420`（含新增文件）与 `git log --graph e85d281..3dbd420`。
1. `ac6c8a5`（pB，`w4:pB/report10.md`）：H02——`--huhu-ok-*` 捕获移入 `packages/ui/src/styles/tokens.css`；`pnpm build` 内置 `check:ok-css`；KaTeX 精确文本例外。请核对守护能否被绕过、例外是否足够窄、tokens.css 中 `var(--muted)` 等在各主题根的解析是否与原语义一致。
2. `cbb2b70`（pH，`w4:pH/report01.md`；依据 pG `w4:pG/report02.md`）：F09——六类 OK 插件的顶层段落插字快路径与 Placeholder 适配。重点：**是否在任何情况下改变编辑语义**（装饰位置、bridge/mark ID、标题 slug 与重名后缀、代码高亮、占位提示、协作标签、撤销/重做、IME、远程 Yjs 事务、粘贴、只读、NodeSelection）；守卫条件是否足够窄；等价性测试 `paragraph-fast-path.test.ts` 是否真正比较了快路径与完整计算；`PATCHES.md` P-F09-01..09 登记与重放是否完整。可对照 `temp/sources/open-knowledge`。

**只做静态审查与读日志，可跑单个 vitest 文件；不要运行 e2e、构建、Electron 或全量测试**（Lead 正在同机跑最终门禁、G07、F09 严格测量与全量 e2e，结果在 `/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int10/`，完成后可读）。
验收：逐项是否成立、问题位置与影响、阻断 / 应修 / 可选分级，以及对 Issue #2 是否还有阻断关闭的问题。回报 `report06.md`，manifest 中 w4:pE 改为 done。
