# 00 来源冻结与闸门（S0）

规格：[spec.md](../spec.md) G01–G04、H01–H04、B01 的前置；[plan.md](../plan.md) §4 停止条件；[decisions.md](../decisions.md) OP-D02 / D05 / D06 / D17 的验证。
交付：来源与基线冻结（含**与上游最新提交的差异记录**，仅记录、不升级）、用户问题在 rc.4 上的真实复现、`rc4` 视觉基线、复刻矩阵与端点矩阵、**六个 spike 的结论（SP-1～SP-6）**、依赖 / 许可证 / 补丁清单；**S0 开始前先把阈值写进 `decisions.md` 与 `plan.md`（已写死：补丁 ≤ 150 个文件、`DocumentContext` / `provider-pool` 的 Huhu 侧替换 ≤ 1200 行、上游测试适配后通过率 ≥ 70%），S0 不得事后放宽，放宽需用户确认**。**S0 不改产品代码**；spike 的代码放在 `scratch/ok-spike` 分支，结论与数据进 `evidence/`。
依赖：无。
边界：唯一写入者 = S0 负责人；不修改 `plugins/`、`packages/` 的生产代码；不覆盖用户本地 `temp/sources` 的任何改动（只读；LICENSE 缺失不去恢复它，取 `git show`）。

## 当前代码 / 来源指针（已核实，见 [evidence/e0-source-survey.md](../evidence/e0-source-survey.md)）

- `temp/sources/open-knowledge`（`44a2e0a`）、`temp/sources/orca`（`7041ea02`）；Huhu `9132640`（`v0.0.1-rc.4`）。
- 拟新增：`scripts/ok-closure.mjs`、`evidence/closure-manifest.json`、`evidence/parity-matrix.md`、`evidence/endpoint-matrix.md`、`evidence/spikes/sp-{1..5}.md`、`evidence/repro/`、`.visual/rc4/`（不进 git）。

## 实施要点

1. **固化来源**：记录两个来源与 Huhu 的完整 SHA、`git status`（含 ` D LICENSE`）、`git show HEAD:LICENSE` 的哈希；`ok-closure.mjs` 从 editor / comments / FileTree / 属性面板入口出发做静态 import 闭包（含动态 `import()`、json、CSS、locales 资源，补上调查时未统计的部分），输出 `closure-manifest.json`（上游路径 → 目标路径 → 复制 / 适配 / 不复制 + 原因 + 行数 + 哈希），同时输出 npm 依赖集合（对照 `pnpm-lock.yaml` 的已有 / 新增 / 版本冲突）与补丁清单。
2. **复现用户问题**：在 `v0.0.1-rc.4` 上，用真实 Electron（Playwright Electron 或手动录屏）复现“鼠标选区 / 上下行光标异常”，记录步骤、样本文档、截图 / 录屏；失败也要写“未能复现”及尝试范围，不编造根因。
3. **`rc4` 视觉基线**：`pnpm visual:baseline rc4`（四主题的范围按 `tests/visual` 现有清单），不进 git；列出知识库相关屏幕（它们在本 change 中有预期变化）。
4. **复刻矩阵**（`parity-matrix.md`）：从 OK 注册表逐项列出——节点 / 标记、扩展、NodeView、工具栏动作、slash 命令来源（`items`、`component-items`、`embed-starter-items`）、输入 / 粘贴 / 拖放规则、快捷键、上下文菜单、序列化方法、对应上游测试、Huhu 适配位置；每项标 **直接复制 / 宿主适配 / 不适用（具体原因）**。“不适用”清单交用户审阅（Q2 的依据）。
5. **端点矩阵**（`endpoint-matrix.md`）：把 `fetch('/api/…')` 与 `window.okDesktop` 的每个调用点（文件:行）、请求 / 响应形状、拟映射的 Huhu 能力、缺口列全（补全 [design.md](../design.md) §4 的草表，含动态拼接与 `okDesktop` 方法清单）。
6. **六个 spike**（各 ≤ 2 天，结论写 `evidence/spikes/`）：
   - **SP-1 闭包编译（闸门）**：把清单里的“复制”部分放进 `packages/editor/src/vendor/open-knowledge/`（scratch 分支），接上必要依赖，Huhu 的 Vite 8 构建通过，独立 `tsconfig.vendor.json` typecheck 通过；记录需要的补丁数与类型。
   - **SP-2 Tailwind v4 限定在 `.ok-root`**：分模块导入进 `vendor.ok-theme / vendor.ok-utilities` 子层（验证 `@import … layer(a.b)` 在 Vite 8 / Lightning CSS 下可行；不可行则试顶层 `ok-*` 层 + 脚本改全部样式文件首行）；验证 `@theme` 不向 `:root` 输出变量；渲染 `SlashCommandMenu` + `FileTree` 菜单在四主题下的外观；**断言：Huhu 根变量（`--font-mono`、`--radius-*`、`--shadow-*`、`--muted`、`--accent` 等一组关键变量）求值前后不变**；`pnpm visual:compare rc4` 非知识库屏幕 0 差异；做出三类 `check-ok-class-collisions` 的原型（含 Huhu TSX 里无 CSS 规则的类 token 如 `hidden` / `truncate`）并报告交集；列出 OK `@layer base`（`globals.css:491`）里全部元素选择器以便作用域化。
   - **SP-3 Lingui**：`@lingui/vite-plugin` + 宏在 Vite 8 / `@vitejs/plugin-react 6` 下可用；`zh-Hans` / `en` 切换；记录构建耗时变化与 chunk 体积。
   - **SP-4 往返保真（闸门）**：`LocalDocProvider` 原型 + `bridge-intake` 摘取函数，对 OK 的 22 个黄金样本和 Huhu 的 `Tasks/` / 档案 / 评论样本做 hydrate → serialize，字节级比较并分类差异；验证 `markdownSemanticallyUnchanged` 在“无编辑”场景返回真；验证 `replaceRawBody` 不进撤销栈。
   - **SP-5 YAML 对拍**：用 issue §14-C02 的样本（`false`、`0`、空字符串、`null`、前导零文本、非完整日期、数组、嵌套、注释、未知键、BOM / CRLF）对 OK `yaml-codec` 与 Huhu `frontmatter.ts`（`patchFrontmatter` 等）做对拍，列出差异；确认 Huhu 的纯逻辑能否抽成浏览器可用入口。
   - **SP-6 运行时闸门（闸门）**：在真实 Electron 里用 `LocalDocProvider` 挂载 `TiptapEditor`（含 `editor-cache` park / evict）：两个文件来回切、切到源码模式再切回、撤销 / 重做、无编辑打开 / 关闭不写盘、输入后立刻关闭不丢最后字符（flush 排空防抖）；统计 `DocumentContext` / `provider-pool` 的 Huhu 侧替换行数与 vendor 补丁文件数，对照写死阈值。
7. **依赖与许可证**：用 `pnpm` 在 scratch 分支安装 126 个包的子集，跑 `pnpm notices`，列出被 `ALLOWED` 拒绝的包与理由；确认 pnpm 补丁机制（`patchedDependencies` 位置与 pnpm 版本）；比较 `@codemirror/*`、`katex`、`mermaid` 等与 OK 的版本差，给出对齐方案。
8. **闸门汇报**：S0 末尾在 `progress.md` 写“通过 / 需调整 / 不通过”，SP-1、SP-4、SP-6 任一不通过、或补丁 / 重写量超过阈值，则停止并向用户汇报，**不进入 S1 之后的实施**。

## 验收

- [ ] `closure-manifest.json` 存在且可由脚本重新生成，哈希与固定 SHA 的本地副本一致；对照调查数字（861 文件 / 约 12.3 万行 / 126 包）的差异有解释。
- [ ] `evidence/repro/` 有 rc.4 上的复现记录（成功或明确的“未能复现”）。
- [ ] `.visual/rc4` 基线生成并记录命令 / 提交 / 时间。
- [ ] `parity-matrix.md` 覆盖 OK 注册表的全部本地编辑项，每项有动作标注；“不适用”项逐个写原因。
- [ ] `endpoint-matrix.md` 覆盖全部 `fetch('/api/…')` 与 `okDesktop` 调用点。
- [ ] SP-1、SP-4、SP-6 有明确“通过 / 不通过”和数据（含补丁文件数、重写行数对照阈值）；SP-2、SP-3、SP-5 有“通过 / 回退方案”。
- [ ] 上游差异记录：两个来源在固定 SHA 之后的提交数与对本 change 相关目录的变更摘要（只记录，不升级）。
- [ ] 补丁数量基线与上限写入 `PATCHES.md` 草稿；pnpm 补丁机制、`gen-notices` 的被拒包清单有结论。

## 完成证据

`evidence/` 下上述文件；`progress.md` 的 S0 闸门结论；scratch 分支提交哈希。实际结果由执行者记录，不预填“通过”。
