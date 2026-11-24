# task02 · ProseMirror 聚焦回调覆盖 Home 后的折叠光标（B06）

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-pm`，分支 `closeout/issue2-pm`。开始前 `git merge --ff-only closeout/issue2-integration`（应快进到 3dbd420）。

依据（必读）：疑难分析 `w4:pD/report05.md`；探针与临时修复副本 `/tmp/huhu-pD05-dwJMot/`（`prepare.py`、`probe.cjs`、`run-when-free.sh`，guard 版本即验证过的方向）。既有补丁 `patches/prosemirror-view@1.41.8.patch`（`77d5add` 引入，覆盖扩选竞态；原包 `src/input.ts:781–804`），证据 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/pm-focus/README.md`。

## 要求
1. 在 `patches/prosemirror-view@1.41.8.patch` 中同步修改源码、ESM、CJS：聚焦后的延迟回调中，若视图仍存活、仍聚焦、可编辑、非组合输入，且**本次聚焦之后**发生过原生键盘导航、折叠端点位于编辑器内且已移动，则先让观察器读取 DOM 光标（`domObserver.flush()` 一类），不得用旧 PM 选区覆盖；无导航时保留原光标恢复语义。区分「本次聚焦后的导航」与「先前输入」（不要仅凭 `lastSelectionOrigin === "key"`）。对照上游最新 prosemirror-view 是否有相同修复，有则对齐其写法。更新 pnpm 补丁指纹、`docs/upstream/ledger.md` R-53 说明、`THIRD_PARTY_NOTICES.md`（`pnpm notices`）。
2. 回归：在 `tests/e2e/knowledge/editor-selection-focus.spec.ts` 用现有「暂存真实聚焦回调」方法加入：段尾点击 → Home 到段首（PM 仍在段尾）→ 放行回调 → Shift+End；断言回调前后 DOM 折叠偏移、PM 最终范围、气泡可见。修复前红、修复后绿。另覆盖：普通重新聚焦后的光标恢复不变、IME 组合中不触发、视图销毁后回调安全。保留原扩选与拖选用例。
3. 验证（零重试）：`pnpm test`、`pnpm test:vendor`、`typecheck`、`lint`、`knip`、`format:check`、`build`（含 check:ok-css）、`notices`、`ok-patches --check`；e2e：`editor-selection-focus.spec.ts`、`editor-parity-selection.spec.ts`、`editor-parity-closeout.spec.ts`（全部）、`editor-s3-*`、`i18n-zh-hans.spec.ts`、`comments-*`、`perf.spec.ts`（`HUHU_PERF_STRICT=1`，确认 F09 仍 ≤16 ms）；`editor-parity-closeout.spec.ts:580 --repeat-each=30 --workers=6`。
4. 负载纪律：w4:pJ 也在跑 e2e；每次前确认无其他 Electron/Playwright，记录起止 uptime。
写入范围：`patches/prosemirror-view@1.41.8.patch`、`package.json`/`pnpm-lock.yaml` 中该补丁指纹、`docs/upstream/ledger.md`、`THIRD_PARTY_NOTICES.md`、`tests/e2e/knowledge/editor-selection-focus.spec.ts`、`evidence/pm-focus/README.md`（追加本次）。其他先说明。
回报 `report02.md`，manifest 中 w4:pH 改为 task02.md done。
