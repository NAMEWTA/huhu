# Issue #2 关闭验收台账

当前归档结论见[交付验收](evidence.md)。下文记录当时的进展、候选和验证范围。

> **重新打开后的状态以[本轮验收记录](verification/reopened/README.md)为准。** 下文保留 `ce913d2` 的历史验收；其中「达到关闭条件」已在 Issue 重新打开时撤回，不适用于当前候选。

- 来源：[Issue #2](https://github.com/NAMEWTA/huhu/issues/2)。2026-11-18 与 2026-11-20 两次用 `gh issue view 2` 在线核对：OPEN，正文与 1 条用户补充评论（2026-11-14T14:25Z）同归档 `source-issue-2.md` 一致，之后没有新评论。
- 规格：归档 [spec.md](../feature_2026-11-14-knowledge-ok-parity/spec.md)，优先级 spec §3 > Issue 评论 > Issue 正文。Q1–Q10 按 `decisions.md` OP-D19 已定。
- 起点：`main` `9f870c0`（OK 移植以 `7edcaa8` 进入）。历史分支 `feat/knowledge-ok-parity` 本地和远端均不存在，内容已在 `main`。
- **交付候选：`ce913d2`**（分支 `closeout/issue2-integration`）。其后的提交只增加本台账与 `evidence/lead/`（不改代码，见文末核对命令）。被取代的候选上的记录移到 `evidence/lead/superseded/`。
- **结论（2026-11-20）：达到关闭条件。** 交付候选 `ce913d2` 上，所有关闭必需项（A01–F10、G01–G07、H01–H07）都有可复查的证据，全量 e2e 零重试 244 通过 / 0 失败，最终独立审查（report07）没有阻断项。环境限制（Q7）与后续项见文末，均不作为关闭条件。
- 归档不等于完成：下表证据都来自候选版本上的实际运行。旧证据只在相关代码之后没有变化时作参考，并注明 SHA。

## 状态口径

| 状态 | 含义 |
| --- | --- |
| 满足 | 交付候选上有可复查的证据 |
| 满足（登记） | 规格要求测量 / 记录 / 登记，已完成；数值未达到项目其他目标的，另行说明 |
| 环境限制 | Q7：Windows/macOS 实机、真实输入法与硬件鼠标，不作为关闭条件，如实登记 |
| 不在范围 | 按 spec §8 / OP-D19 排除，只登记 |

## 最终候选的门禁（G06）

`ce913d2`，Linux x64 / i7-12700 / 8 个逻辑 CPU，Node 26.11.1，pnpm 12.10.1，Electron 44.9.1，Playwright 1.65.0，Xvfb。原始记录：final-progress.log（历史位置 `evidence/lead/final-progress.log`，本次未取得原件）。

| 门禁 | 结果 | 证据 |
| --- | --- | --- |
| `format:check` `lint` `typecheck` `build`（含 `check:ok-css`） `knip` `notices` | 全部退出 0 | final-progress.log、final-build.log（历史位置 `evidence/lead/final-build.log`，本次未取得原件） |
| `pnpm test` | 1006 通过 / 1 跳过 | final-unit-summary.txt（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/lead/final-unit-summary.txt`） |
| `pnpm test:vendor` | 6427 通过 / 4 跳过 | 同上 |
| `ok-patches --check` | 285 条登记，未登记 0，多余 0 | final-ok-patches.log（历史位置 `evidence/lead/final-ok-patches.log`，本次未取得原件） |
| `ok-patches --replay`（固定 OK `44a2e0a`） | 1348 文件，集合与字节零差异 | final-replay.log（历史位置 `evidence/lead/final-replay.log`，本次未取得原件） |
| `pnpm e2e`（零重试，全量） | **244 通过 / 0 失败 / 4 跳过**，22.2 分钟。跳过项：10 万文件用例（默认关闭，验收见 `b8e760f`）、3 个截图用例 | final-e2e-full.log（历史位置 `evidence/lead/final-e2e-full.log`，本次未取得原件） |
| 打包 `electron-builder --dir` + ASAR 检查 | 51,021 个条目，构建标识读回 `ce913d2`，不含测试源、助手、结果或夹具 | final-asar.log（历史位置 `evidence/lead/final-asar.log`，本次未取得原件） |
| `pnpm e2e:packaged`（同一解包应用） | 4/4 | final-e2e-packaged.log（历史位置 `evidence/lead/final-e2e-packaged.log`，本次未取得原件） |

全量 e2e 的历次结果（零重试）：`471dfdf` 236 通过 / 2 失败（F09、A07）；`cf882bd` 237 / 2（F09、文件树空清单）；`e85d281` 239 / 1（F09）；`3dbd420` 239 / 1（块类型选区，B06 竞态）；`ce913d2` 244 / 0。每次失败都定了因：A07、文件树空清单、F09、B06 是真实缺陷，都已修复，见「本轮补齐的缺口」。日志在 `evidence/lead/e2e-full-*.log`。

## 逐项结果

e2e 列中的用例都在 `final-e2e-full.log` 里，单测都在最终 `pnpm test` / `test:vendor` 中通过。

### A 文件树与资源

| 项 | 状态 | 证据（候选 ce913d2） |
| --- | --- | --- |
| A01 真实文件系统展示 | 满足 | `packages/vault/test/list.test.ts`、`packages/editor/test/host-files.test.ts`；e2e `workflows/acceptance.spec.ts`、`knowledge/explorer-first-listing.spec.ts`（新建后首次列举，本轮修复） |
| A02 隐藏规则 | 满足 | `plugins/notes/test/service.test.ts` hiddenPaths；`host-files.test.ts`；e2e `acceptance.spec.ts` |
| A03 隐藏后引用与打开 | 满足 | `host-files.test.ts`、`plugins/tasks/test/service.test.ts`；e2e `acceptance.spec.ts` |
| A04 大目录 `@` 候选 | 满足 | `packages/workbench/test/resources.test.ts`、`plugins/notes/test/explorer-deps.test.ts`；10 万文件按需树 `b8e760f` |
| A05 新建 / 删除即时生效 | 满足 | `host-files.test.ts`、`list.test.ts`；e2e `explorer-first-listing.spec.ts` |
| A06 右键 / 键盘 / 边缘 | 满足 | e2e `knowledge/explorer-keyboard.spec.ts`「A06 行内、右键与 Shift+F10」；[session/gaps.md](verification/session/gaps.md) |
| A07 移动 / 拖放 / 冲突 | 满足 | e2e `explorer-keyboard.spec.ts`「A07 拖到空白处」、`acceptance.spec.ts:618`（过期目标）；`apps/engine/test/engine.test.ts`（缺失目录 / 文件 / 后代被拒）。**对外能力变化**见下文 |
| A08 脏文档操作 | 满足 | `explorer-deps.test.ts`；e2e `session-flush.spec.ts`、`layout-tab-menu.spec.ts` |
| A09 计数 | 满足 | `packages/vault/test/repository.test.ts`、`list.test.ts`、`resources.test.ts` |
| A10 受保护文件 / 外部权限 | 满足 | `host-files.test.ts`、`list.test.ts`；`engine.test.ts`（`templatePath` 仅限桌面、Automations 拒绝） |

### B 编辑器

| 项 | 状态 | 证据 |
| --- | --- | --- |
| B01 上游功能矩阵 | 满足 | [parity/parity-82.md](verification/parity/parity-82.md)：82 行，78 行已验证，4 行由 Huhu 等价物取代且已验证；[shell-mounts.md](verification/parity/shell-mounts.md)；用例均在最终全量中 |
| B02 语义往返 | 满足 | e2e `editor-parity-closeout.spec.ts`、`editor-s3-matrix.spec.ts`、`editor-s3-parity.spec.ts`；`golden-roundtrip.test.ts` |
| B03 斜杠菜单 | 满足 | e2e `editor-s3-menus.spec.ts`、`editor-s3-rules.spec.ts`；与 OK 对照见 [parity-ok/slash.md](verification/parity-ok/slash.md) |
| B04 中文组合输入 | 满足，有环境限制 | vendor `suggestion-ime-triggers.dom.test.tsx` 等；CDP 合成 IME 的 e2e。真实输入法属 Q7 |
| B05 范围 / 撤销 | 满足 | e2e `editor-s3-rules.spec.ts`、`editor-s3-menus.spec.ts`；`golden-roundtrip.test.ts` |
| B06 鼠标选区 | 满足，有环境限制 | e2e `editor-parity-selection.spec.ts`、`editor-selection-focus.spec.ts` ×6（扩选、拖选、Home 后折叠光标、重新聚焦恢复、IME、销毁）、`editor-parity-closeout.spec.ts:580`（6 worker 压测 30/30）。`prosemirror-view` 补丁 `77d5add` + `10f8dd6`，对齐上游 1.43.0 的选区快照比较，见 [pm-focus](verification/pm-focus/README.md)。硬件鼠标属 Q7 |
| B07 列表 / 代码 / 表格 / 剪贴板 | 满足，有环境限制 | e2e `editor-parity-closeout.spec.ts`、`editor-parity-closeout-remaining.spec.ts`；[parity-ok/table.md](verification/parity-ok/table.md) |
| B08 不重建、不抢焦点 | 满足 | e2e `editor-s3-toolbar.spec.ts`、`session-flush.spec.ts`、`comments-edge-rail.spec.ts` |
| B09 模式切换 / 迟到结果 | 满足 | e2e `editor-s2b.spec.ts`、`session-flush.spec.ts`；`plugins/tasks/test/service.test.ts` |
| B10 不写盘 / 保真 | 满足 | e2e `session-persistence.spec.ts`「H01 关闭无编辑笔记零次保存」、`editor-parity-closeout.spec.ts` 保真用例 |

### C 属性与保存

| 项 | 状态 | 证据 |
| --- | --- | --- |
| C01 顶部属性 | 满足 | e2e `editor-s3-properties.spec.ts` |
| C02 黄金样本 | 满足 | `packages/editor/test/frontmatter-codec.test.ts` |
| C03 局部改写 | 满足 | e2e `editor-s3-properties.spec.ts`、`fidelity-local-edit.spec.ts` |
| C04 正文与属性交错 | 满足 | e2e `editor-s3-properties.spec.ts` |
| C05 坏 YAML | 满足 | e2e `session-persistence.spec.ts`「C05 坏 YAML 保留原文」 |
| C06 冲突 / flush / 草稿 | 满足 | `plugins/notes/test/document-session.test.ts`；e2e `session-flush.spec.ts`（设置返回草稿竞态、手动模式右键关闭、退出回执）、`layout-tab-menu.spec.ts` |

### D 评论

| 项 | 状态 | 证据 |
| --- | --- | --- |
| D01 三种评论入口 | 满足 | e2e `comments-persistence.spec.ts`「D01 / D06」、`comments-s4.spec.ts` |
| D02 与 OK 对照 | 满足 | e2e `comments-edge-rail.spec.ts`、`comments-s4.spec.ts`；对照 [parity-ok/comments.md](verification/parity-ok/comments.md)、[unaligned.md](verification/parity-ok/unaligned.md)。Huhu 另有回复、解决、过滤、重开和删除确认，登记为差异（独立审查 report03 认可） |
| D03 双向定位 | 满足 | e2e `comments-s4.spec.ts`、`comments-edge-rail.spec.ts` |
| D04 锚点 | 满足 | `plugins/notes/test/comments.test.ts`；e2e `comments-s4.spec.ts` |
| D05 异步 flush 期间编辑 | 满足 | `comments.test.ts`；e2e `comments-s4.spec.ts` |
| D06 移动 / 回收站 / 档案 | 满足 | e2e `comments-persistence.spec.ts`、`archives-tabs.spec.ts`「D06」、`compact-cost.spec.ts`（任务评论） |

### E 档案

| 项 | 状态 | 证据 |
| --- | --- | --- |
| E01–E03 | 满足 | e2e `workflows/archives-tabs.spec.ts`；`plugins/notes/test/doc-tabs.test.ts`、`shell-state.test.ts` |
| E04 同一会话 | 满足 | e2e `archives-tabs.spec.ts`「E04」×2、`session-archives.spec.ts`；[session/e04-flake.md](verification/session/e04-flake.md) |
| E05 附件统一查看器 | 满足 | e2e `archives-tabs.spec.ts`「E05」；`plugins/notes/test/archives.test.ts` |

### F 格式、布局与性能

| 项 | 状态 | 证据 |
| --- | --- | --- |
| F01 JSON / TXT | 满足 | e2e `workflows/viewers.spec.ts` |
| F02 编码 / 大文件 | 满足 | e2e `viewers.spec.ts`；`packages/editor/test/plain-text.test.tsx` |
| F03 PDF | 满足 | e2e `viewers.spec.ts` 三个 F03 用例（11 MiB 分段读、加密、损坏、外部替换） |
| F04 HTML 预览 | 满足 | e2e `viewers.spec.ts`、`knowledge/preview-html.spec.ts`；[layout/html-preview.md](verification/layout/html-preview.md) |
| F05 HTML 隔离 | 满足 | e2e `preview-html.spec.ts`、`viewers.spec.ts`；打包模式见 `e2e:packaged`。dev 模式整体运行问题与本 Issue 无关 |
| F06 图标 | 满足 | `packages/ui/test/file-icon.test.tsx`；e2e `viewers.spec.ts` |
| F07 工具栏收纳 | 满足 | e2e `editor-s3-toolbar.spec.ts`（宽度 × 缩放矩阵）；[layout/f07-toolbar.md](verification/layout/f07-toolbar.md) |
| F08 主题 | 满足 | e2e `theme-ok-tokens.spec.ts`、`a11y.spec.ts`；[layout/f08-theme.md](verification/layout/f08-theme.md) |
| F09 性能测量 | 满足 | 见下文「F09 输入延迟」：测量已记录；项目质量目标 p95 ≤ 16 ms 在候选上严格三轮全部通过 |
| F10 泄漏 | 满足 | e2e `knowledge/leak.spec.ts`、`viewers.spec.ts`、`layout-tab-menu.spec.ts` |

### G 移植工程

| 项 | 状态 | 证据 |
| --- | --- | --- |
| G01 固定 SHA 与文件清单 | 满足 | 归档 `evidence/closure-manifest.json`（OK `44a2e0a`）；最终候选按固定 SHA 重放，1346 文件的集合与字节零差异，说明 vendor 内容仍与清单一致 |
| G02 补丁登记与重放 | 满足 | `ok-patches --check` 268/0/0、`--replay` 零差异；[parity/vendor-replay.json](../../../../../../docs/upstream/ok-parity/vendor-replay.json) |
| G03 台账与声明 | 满足 | `pnpm notices` 退出 0；`docs/upstream/ledger.md`（含 R-53 `prosemirror-view` 补丁） |
| G04 上游测试接入 | 满足 | `test:vendor` 6391 / 4 跳过；[parity/dom-tests-applicability.md](../../../../../../docs/upstream/ok-parity/dom-tests-applicability.md) |
| G05 旧路径删除 | 满足 | `knip` 退出 0；在候选上按归档 S8 的同一范围重跑 15 个模式，全部 0 命中：g05-zero-reference.txt（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/lead/g05-zero-reference.txt`） |
| G06 全门禁 | 满足 | 上文门禁表，所有门禁都已执行并记录 |
| G07 体积与启动 | 满足 | 见下文「G07」 |

### H 集成约束

| 项 | 状态 | 证据 |
| --- | --- | --- |
| H01 往返字节 | 满足 | `packages/editor/test/golden-roundtrip.test.ts`（上游 119 + Huhu 3，加撤销用例）；e2e `session-persistence.spec.ts` |
| H02 样式作用域 | 满足 | OK 规则用零特异性 `:where(.ok-root, .ok-root *)` 限定作用域，portal 根补 `.ok-root`（`eb21c5b`）；不导入 preflight，层序见 OP-D05。构建守护 `pnpm check:ok-css` 由 `pnpm build` 执行，按选择器 AST 判定，未登记的 A/B 交集或越界规则都会让构建失败；在旧产物上报 C=2279，修复后 C=0。剩余 A 10 / B 12 逐个按精确类名登记了理由（都只在 OK 根内生效），18 个负例测试通过：h02-guard.txt（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/lead/h02-guard.txt`）。非知识库七屏 × Claude 明暗的计算样式零差异，像素差在仓库容差内（`w4:pJ/report01.md`）。KaTeX 的 `body{counter-reset}` 按精确文本登记为第三方既有规则（rc.4 已有）。说明：规格原文要求「空交集」，这里采用的口径是规则全部限定在作用域内，剩余交集逐个登记理由，未登记即构建失败；独立审查 report07 认可这一口径。历史 `visual:compare rc4` 中截图与宽度矩阵的既有差异见归档 `visual-compare-rc4.md`，本轮即时对照没有新增差异 |
| H03 zh-Hans | 满足 | e2e `i18n-zh-hans.spec.ts` ×3（扫描、斜杠逐项、即时切换并保留草稿）；[layout/h03-i18n.md](verification/layout/h03-i18n.md) |
| H04 宿主适配 | 满足 | [parity/endpoint-matrix.md](verification/parity/endpoint-matrix.md)；e2e `host-routes.spec.ts` |
| H05 compact 变体 | 满足 | e2e `compact-cost.spec.ts`、`compact-submit.spec.ts` ×4 |
| H06 Yjs 本地化与释放 | 满足 | e2e `leak.spec.ts` |
| H07 局部字节差异 | 满足 | e2e `fidelity-local-edit.spec.ts` |

## G07 启动与体积

测量脚本：`scripts/measure-notes-startup.mjs`。工作台终点改为浏览器内首个同时满足「工作台非零布局、可见、引擎就绪」的 rAF 帧（`homeMs`）。旧的 Playwright locator 计时并列输出为 `homeLocatorMs`。改动原因：疑难分析发现，locator 的轮询退避（末段约 500 ms）会把实际就绪帧延后确认，造成约 +60～110 ms 的伪差值。同次启动的两种时钟对照见 `w4:pG/report01.md`（Herdr 主题目录）。

`ce913d2` 对 rc.4 `9132640`，20 对交替，每次使用新 profile 和 2,001 篇 Vault。A/B 和 A/A 各自等负载回落后起跑，起跑时 1 分钟负载分别为 1.92 和 1.90，运行中 1.90–3.87，见 g07-final-load.txt（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/lead/g07-final-load.txt`） 和 final-progress.log（历史位置 `evidence/lead/final-progress.log`，本次未取得原件）。候选 A/A 测 20 对，作为同构建波动的参照。

| 指标（ms） | rc.4 p50 / p95 | 候选 p50 / p95 | 配对差中位（候选较慢对数） | 候选 A/A 配对差中位（较慢对数） |
| --- | ---: | ---: | ---: | ---: |
| 冷启动 → 工作台可见且引擎就绪（同帧） | 1051.0 / 1172.6 | 1058.9 / 1161.2 | +6.8（11/20） | −9.8（8/20） |
| 同上，旧 locator 计时 | 1407.1 / 1588.1 | 1485.3 / 1533.1 | +36.8（12/20） | −1.0（10/20） |
| 工作台 → 收件箱可见（非知识库模块） | 70.1 / 81.9 | 64.7 / 82.1 | −5.6（6/20） | +7.2（12/20） |
| 首篇笔记可编辑（知识库，按规格记录） | 71.6 / 84.6 | 463.6 / 485.8 | +391.5（20/20） | −1.7（9/20） |

结论与口径：测量的端点是「工作台外壳可见且引擎就绪」（同帧计时）和「从工作台切到收件箱外壳首次可见」。两项的配对差中位都在同构建 A/A 波动范围内，较慢对数接近一半，p95 点估计不高于 rc.4（工作台 1161 对 1173 ms，收件箱 82.1 对 81.9 ms）。据此未检出回退。旧 locator 计时的 +36.8 ms 一并列出：这个时钟受 Playwright 轮询退避量化（末段约 500 ms），在同一次启动里与实际就绪帧的差约 330–350 ms（`w4:pG/report01.md`、`w4:pE/report05.md`），所以不作为回退判定依据。各轮读数分别为 +22.1、−1.3、+36.8 ms。20 对样本不能排除幅度更小、可重复的尾部变化。没有测首页卡片数据填充完成的时间，也没有测各非知识库模块直接冷启动的入口。首篇笔记从 CodeMirror 换成 OK 富文本，约增加 0.4 s。规格对此项只要求记录（Q9），编辑器闭包按需加载（工作台与收件箱不解析 rich / host-fetch / NoteEditorSurface 块，见 [layout/g07-budget.md](verification/layout/g07-budget.md)）。

体积（同格式 Debian amd64，`electron-builder --linux deb`）：rc.4 141,619,672 B → `ce913d2` 225,401,008 B，增加 83,781,336 B（+59.2%）。见 final-deb-size.txt（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/lead/final-deb-size.txt`），rc.4 数据见 [layout/g07-budget.md](verification/layout/g07-budget.md) task03。Q9 不设上限。编辑器 chunk：rich JS 约 5.2 MB，host-fetch JS 约 2.9 MB，explorer JS 约 0.7 MB（final-build.log（历史位置 `evidence/lead/final-build.log`，本次未取得原件））。原始样本：g07-final-rc4.jsonl（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/lead/g07-final-rc4.jsonl`）、g07-final-aa.jsonl（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/lead/g07-final-aa.jsonl`）。`cf882bd` 上旧口径的一轮（homeMs +56.5 ms，16/20）保留在 g07-cf882bd-locator.jsonl（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/lead/g07-cf882bd-locator.jsonl`）。

## F09 输入延迟

同一命令 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '编辑输入延迟'`，每轮起跑前 1 分钟负载低于 2，且没有其他 Electron/Playwright 进程：

| 构建 | p95 | 样本 | 16 ms 门槛 |
| --- | ---: | ---: | --- |
| rc.4 `9132640`（CodeMirror） | 14.8 ms | 80 | 通过 |
| `main` `9f870c0`（OK 富文本，5 轮配对中位） | 22.4 ms | 5×80 | 0/5 |
| `e85d281`（修复前候选） | 21.8 ms | 80 | 失败 |
| **`ce913d2`（交付候选）三轮** | **12.3 / 14.2 / 14.1 ms** | 3×80 | **3/3 通过** |
| `ce913d2` 全量 e2e 中 | 12.3 ms | 80 | 通过 |

日志：f09-strict-rc4.log（历史位置 `evidence/lead/f09-strict-rc4.log`，本次未取得原件）、`f09-strict-ce913d2-{1,2,3}.log`、`superseded/e85d281-f09-strict-e85d281.log`。

定因与修复：OK 富文本里有六类插件在每次按键时遍历全文或编辑区 DOM，包括裸 HTML 图片装饰、bridge/mark ID、代码高亮、标题锚点、占位提示和协作标签层。疑难分析见 `w4:pG/report02.md`。`cbb2b70` 只对「单个 replace step、零长插入、闭合 slice、唯一无 mark 文本、位于顶层 paragraph」这类事务走快路径，其余事务一律回到原计算。36 个等价性用例比较了快路径和完整计算的装饰与 ID。补丁登记为 P-F09-01..09，独立审查 report06 认为编辑语义没有变化。另有一项登记：在 5,000 段文档中连续输入时，延后结算会造成约 1.8 s 的最长按键间隔，修复前后都有（main 已有），不在本门槛测量范围内，作为后续体验项。

## 本轮补齐的缺口（2026-11-18～20）

| 类别 | 内容 | 提交 |
| --- | --- | --- |
| 未实现 / 缺陷 | C06/H05 延后结算没有接 drainer、评论提交读到过期闭包；E04 保存竞态；档案退出丢正文；手动模式切到档案视图会写盘；drainer 拒绝时跳过保存；受保护路径与分块读取版本；B06 快速改选丢段落 | session 分支各提交 |
| 回归 | 设置返回时草稿与新输入竞争（06d0afb 引入，f8f5710 修复）；手动模式下右键关闭标签写正文（f8f5710）；设置页 Mod+F 被隐藏编辑器消费（4394d12） | 见 `w4:pE/report02.md` |
| 未实现 | F07 工具栏遮挡、F08 token 映射、H03 文案与语言设置、标签右键菜单、HTML 预览资源、离线表情、外壳挂载件、模板导入接入新建、D02 评论边缘栏、富文本 Mod+K 编辑链接 | layout / parity 分支 |
| 性能 | F09 每键全页查询（dedfab7）；ProseMirror 聚焦回调写回过期光标（77d5add，`prosemirror-view` 补丁对齐上游 1.42.9） | parity / pm 分支 |
| 发布 | ASAR 带入测试文件 | layout 分支 |
| 本轮独立审查发现 | 树菜单把同级目录的模板误列为继承；`notes.create` 的 `templatePath` 扩大外部能力（e6c1e25） | `w4:pE/report03.md` |
| 全量 e2e 暴露 | A07 拖放落到过期树行时静默重建已移走的目录（4f5d524、cea7b3c）；文件树首次挂载命中空清单（main 已有，affeb58）；a11y 键盘用例同步 | `w4:pC/report08.md`、`w4:pD/report04.md`、`w4:pB/report09.md` |
| 测量 | G07 计时端点改为同帧（6d76add） | `w4:pG/report01.md` |
| 守护回归 | H02：F08 引入的全局 `:root` 变量移入宿主 token 层（ac6c8a5）；OK 规则作用域化、portal 补 `.ok-root`（修复深色气泡透明）、守护改为 AST 判定并阻断构建（eb21c5b） | `w4:pB/report10.md`、`w4:pJ/report01.md` |
| 性能 | F09：OK 插件每键全文扫描的保守快路径（cbb2b70） | `w4:pG/report02.md`、`w4:pH/report01.md` |
| 缺陷（main 已有） | B06：聚焦回调覆盖 Home 后的折叠光标（10f8dd6、f9dbed3，对齐上游 1.43.0） | `w4:pD/report05.md`、`w4:pH/report02.md` |

## 决定与登记

- **Mod+K**：富文本编辑器内编辑链接（与 OK 一致）；编辑器外和源码模式仍打开命令面板（沿用 Mod+T 的先例）。这是可逆的产品决定，覆盖了工作台 US-WB-07 / ACC-WB-07 中编辑器聚焦时的约定，底部按钮仍可打开命令面板。独立审查认可选区行为与固定 OK 等价。
- **`notes.move` 对外契约收紧**：非空 `targetDir` 必须是 Vault 内已存在的目录，否则返回 `NOT_FOUND`；空字符串仍表示移到 Vault 根。以前会隐式创建目录，这绕过了网关不向外部开放 `folders.create` 的策略。外部调用方只能移动到已存在的目录，缺失的目录由桌面端创建后重新请求（要用新的幂等键）。
- **`notes.create.templatePath`** 仅限桌面调用方。CLI 能力发现仍会列出该参数，说明待补（可选，不阻断）。
- **D02** 评论 Markdown 内容两端都按字面显示，判定等价；Huhu 多出的线程操作登记为差异。
- **H03** 语言切换已实现（此前「不适用」的判断已撤回）。
- **Q7 环境限制**：Windows/macOS 实机、真实输入法和硬件鼠标没有验证。B04、B06、B07 中用 CDP 合成输入的部分如实登记。共享前端按 Electron 44.9.1（Chromium 152）跑全量。编辑器独立浏览器入口（`build:harness`）在 Chromium 158 上做过定向验证：段落输入、重名锚点、代码高亮、Home 光标、作用域内外 `.flex`。没有单独跑全量。

### 后续项（不阻断关闭，已登记）

- 在 5,000 段文档中连续输入时，延后结算会造成约 1.8 s 的最长按键间隔（main 已有，`w4:pH/report01.md`）。
- 测量与回归用例的可观察性：首次列举用例记录首个请求的发起顺序、状态和副本构建 SHA；启动测量补充探针安装时刻与跨进程时钟校准（`w4:pE/report05.md`）。
- F09 快路径补充真实 Yjs 远端、撤销 / 重做、组合输入提交后的事务序列对照（`w4:pE/report06.md` 可选项）。
- CLI 能力发现中说明 `notes.create.templatePath` 仅限桌面（`w4:pE/report04.md`）。
- 把 KaTeX 第三方样式独立成 vendor 块，再撤销守护中的精确文本例外（`w4:pB/report10.md`）。
- a11y 键盘用例末尾断言任务状态已持久化（`w4:pE/report05.md`）。
- H02：作用域插件对以伪元素开头的逗号成员（`::backdrop`）在插入位置前多了一个空格，自身就是 `.ok-root` 的 dialog 不会命中。当前只有 `@supports` 回退里的 `--tw-*` 初值受影响，没有观察到可见问题（`w4:pE/report07.md`）。
- H02：新挂 `.ok-root` 的浮层（如 lint 提示）在 Vercel 等字体不同的主题下，会从继承宿主字体变为继承 OK 的 Inter。应按 OP-D05 映射宿主字体，并补其他主题的字族对照（`w4:pE/report07.md`）。
- B06：键盘重新聚焦后，Home 或 Ctrl+Home 回到文档第一个可放光标的位置时，可能触发 1.41.8 观察器原有的「文档起点复位」启发式。需要补对照（`w4:pE/report07.md`）。
- 深色图片缩放遮罩依赖 `.dark` 祖先的历史规则，需要用实际 overlay 补证（`w4:pE/report07.md` 可选项）。

## 派遣与审查记录

派遣任务、报告及清单见 [Herdr 原记录](../../../../../system/herdr/2026-11-18-issue2-closeout)。台账中的 `w4:pX/reportNN.md` 对应其下的 `w4-pX/reportNN.md`。有额外内容的副本保存在[收尾附件](verification/herdr/)。仍保留的运行原件位于 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/`。

| 会话 | 角色 / 模型 | 任务 |
| --- | --- | --- |
| w4:pA `impl-parity` | 具体实现 / gpt-6.2-sol medium | B01 矩阵、H07、F09 查询修复、Mod+K、D02 边缘栏、G07 测量脚本 |
| w4:pB `impl-layout` | 具体实现 / gpt-6.2-sol medium | F07、F08、H03、G07、表情 / 外壳、模板、文件树首次列举 |
| w4:pC `impl-session` | 具体实现 / gpt-6.2-sol medium | 会话 / 保存 / 评论 / 档案缺口、草稿竞态、A07 |
| w4:pF `impl-pm` | 具体实现 / gpt-6.2-sol medium | ProseMirror 聚焦回写 |
| w4:pD `analyst` | 疑难分析 / gpt-6.2-astra high | 根因：保存竞态、F09 查询、文件树空清单与键盘焦点、B06 聚焦光标 |
| w4:pG `analyst-perf` | 疑难分析 / gpt-6.2-astra high | G07 冷启动伪差值；F09 每键扫描 |
| w4:pH `impl-perf` | 具体实现 / gpt-6.2-sol medium | F09 快路径、B06 聚焦光标补丁 |
| w4:pJ `impl-css` | 具体实现 / gpt-6.2-sol medium | H02 作用域化与守护 |
| w4:pE `impl-review` | 独立审查 / gpt-6.2-sol xhigh | report01–07：各轮实际候选（含新增文件）与修复复核 |

两次机器重启后用 `codex resume` 恢复会话。失败、重跑和高负载样本保留在各 report 与 `evidence/*/runs.md` 中。

## 核对命令

```sh
git diff ce913d2 <最终提交> --stat -- . ':!.agents'   # 应为空：之后只有台账和证据
git log --graph --oneline 9f870c0..<最终提交>
```
