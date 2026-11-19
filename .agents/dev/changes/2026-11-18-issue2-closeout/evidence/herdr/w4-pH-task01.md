# task01 · F09 实时预览输入延迟：OK 插件每键全文扫描的保守快路径

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-pm`，分支 `closeout/issue2-pm`。开始前 `git merge --ff-only closeout/issue2-integration`（应快进到 569512e），在其上提交。

## 依据（必读）
疑难分析 `w4:pG/report02.md`。原型与驱动在 `/tmp/pgf09/`（`fast.py` 生成临时快路径构建、`gate.py` 交错诊断、严格用例副本 `f09-pg-temporary.spec.ts`、`fast/` 为原型产物），原型三轮 p95 12.0/11.9/13.6 ms，原严格用例 3/3 通过。rc.4 14.8–17.4 ms，候选 21.8–24.7 ms。
目标：项目质量目标 `quality.md` 编辑输入延迟 p95 ≤ 16 ms（`tests/e2e/perf.spec.ts:148`，`HUHU_PERF_STRICT=1`）。**不得改变任何编辑语义**；快路径只覆盖报告所述窄条件（单个 replace step、零长替换、闭合 slice、唯一无 mark 文本节点、位于深度 1 的 paragraph），其余一律走原逻辑。

## 改动范围（均在 `packages/editor/src/vendor/open-knowledge/app/src/editor/` 下，除非注明）
按 pG report02「给实现会话的修改范围」表逐项实现：
1. `extensions/bare-html-image-decoration.tsx`
2. `extensions/bridge-id-plugin.ts`、`extensions/mark-identity.ts`
3. `extensions/code-block-lowlight-plugin.ts`
4. `extensions/heading-anchors.ts`
5. Tiptap Placeholder（接入点 `TiptapEditor.tsx`；本地适配或项目已有 pnpm patch 方式，二选一并说明）
6. `caret-label-layer.ts`
vendor 改动必须：在 `PATCHES.md` 逐条登记（编号、文件、原因、重放说明，沿用现有格式）；`node scripts/ok-patches.mjs --check` 0 未登记 / 0 多余；`OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --refresh-replay` 后 `--replay` 零差异，提交重放产物。若用 pnpm patch，更新 `docs/upstream/ledger.md` 与 `pnpm notices`。

## 验证（全部零重试，如实记录失败与重跑）
1. 等价性单测（新增，放在 vendor 现有测试旁或 `packages/editor/test/`）：对含标题（含重名）、裸 HTML 图片、代码块、链接、JSX、mark 的文档，比较快路径与完整计算的 DecorationSet（位置与内容）、bridge/mark ID、heading ID；覆盖 report02 表中每个「必须覆盖的回退」场景。
2. `pnpm test`、`pnpm test:vendor`、`pnpm typecheck`、`pnpm lint`、`pnpm knip`、`pnpm format:check`、`pnpm build`（含 `check:ok-css`）、`pnpm notices`。
3. 严格性能：`HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '编辑输入延迟' --retries=0` 与未改候选（569512e 构建，可用 `/home/wta/projects/huhu-wt-int` 的产物）交错至少 3 轮，每轮起跑前负载 <2 且无其他 Electron/Playwright；记录 p95/最大/返回码。另记录持续输入 >3 s 时的键间隔与保存、切源码耗时（report02「合入前验证」第 3 点），两侧对比。
4. 回归 e2e：`tests/e2e/knowledge/` 下 editor-* 全部、comments-*、attachments、session-*、i18n-zh-hans、fidelity-local-edit、journey、compact-*，以及 `perf.spec.ts` 全部。
5. 前端改动按 AGENTS.md 先走 zh-modern-web-guidance。

写入范围：上列 vendor 文件与 `TiptapEditor.tsx`、`PATCHES.md`、重放产物（`.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/vendor-replay.*`）、新增等价性测试、必要的 patches/ledger/notices。其他文件先在报告说明。
回报 `report01.md`（提交 SHA、逐项改动、各命令结果与日志路径），manifest 中 w4:pH 改为 done。
