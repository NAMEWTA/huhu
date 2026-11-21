# task01 · F09 实时预览输入延迟

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout` |
| pane_id | `w4:pH` |
| task | `task01.md` |
| 任务文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pH/task01.md` |
| 报告文件 | `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pH/report01.md` |
| 工作目录 | `/home/wta/projects/huhu-wt-pm` |
| 实现分支 | `closeout/issue2-pm` |
| 基线 | `569512e63bf26d7ef43f79081164ad405b238170` |
| 提交 | `cbb2b7082a9502008ac493b525693f880c13e45d` |
| 执行结果 | `done` |

## 结论

五轮严格对照均采集 80 个按键样本。优化后五轮 p95 均低于 16 ms，五轮中位数从 18.0 ms 降到 10.6 ms。持续输入时键间隔 p95 下降，两侧都还出现约 1.8–1.9 秒的最长间隔。正式用例的计时终点为编辑区 DOM 更新。 [质量目标](/home/wta/projects/huhu-wt-pm/.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/quality.md:42) · [起跑记录](/tmp/huhu-f09-pH/starts.tsv) · [返回码](/tmp/huhu-f09-pH/exit.tsv)

## 产物与逐项改动

- 在 vendor 编辑器扩展目录新增共享守卫。只接受一个 `ReplaceStep`、零长替换、闭合切片、唯一无标记文本节点、位置在深度 1 的段落。历史操作和 Yjs 同步事务走原有路径。
- 裸 HTML 图片在已有装饰为空，变更段落没有 `<`，且插入点两侧没有行内代码等字面标记时复用空集合。完整扫描仍负责识别图片、原始 Markdown 及渲染位置。
- Bridge ID 和 mark ID 只在旧 ID 集合为空且通过守卫时复用状态。链接、mark 与 JSX 的位置更新、ID 分配和回调沿用原逻辑。
- 代码高亮在守卫通过且前后选区都在高亮块外时映射现有装饰。标题装饰改存插件状态，无文档变化直接复用，安全插入只映射位置，其余重算 slug 和重名后缀。
- 在 `TiptapEditor.tsx` 通过 Tiptap 的 `Placeholder.extend` 接入本地适配。从上游插件取得原有装饰函数，供边界、空文档、只读、嵌套、节点选择、组合输入等场景继续调用。此方案无需引入 pnpm 补丁。
- 协作标签层按原时机创建和定位。第一次注册标签后恢复原 `reconcile` 扫描，对多个编辑面使用同一个曾注册标志。
- 新增等价性用例，对同一批步骤并用强制回退和新文档初始计算比对装饰位置、属性、widget 键、bridge 和 mark ID。验证重名标题、图片、代码块、链接、JSX、mark、复杂事务、注册回调、占位提示以及协作层生命周期。补丁登记 P-F09-01 至 P-F09-09，重放基于固定上游 `44a2e0a`。 [PATCHES.md](/home/wta/projects/huhu-wt-pm/packages/editor/src/vendor/open-knowledge/PATCHES.md) · [等价性用例](/home/wta/projects/huhu-wt-pm/packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/paragraph-fast-path.test.ts)

## 严格交错性能

同一工作树和用例入口，按轮在原位轮换两份生产构建，各启动独立应用和 Vault。Electron 44.9.1（Chromium 152.0.7977.167），Playwright 1.65.0，Xvfb。每次启动前一分钟负载低于 2，检查无其他 Electron/Playwright 进程。命令为 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '编辑输入延迟' --retries=0`，附加独立 `--output` 目录。各轮日志中所有有效样本数均为 80。

| 轮次 | 基线起跑负载 | 基线 p95 / 最大（ms） | 基线返回码 | 实现起跑负载 | 实现 p95 / 最大（ms） | 实现返回码 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.56 | 18.0 / 24.8 | 126 | 1.97 | 10.8 / 17.5 | 0 |
| 2 | 1.84 | 16.2 / 30.4 | 126 | 1.89 | 9.8 / 16.5 | 0 |
| 3 | 1.92 | 17.2 / 25.6 | 126 | 1.79 | 10.6 / 17.0 | 0 |
| 4 | 1.65 | 25.7 / 28.2 | 126 | 1.93 | 12.1 / 18.6 | 0 |
| 5 | 1.99 | 19.4 / 27.1 | 126 | 1.90 | 10.6 / 15.7 | 0 |

表中基线的 Playwright 断言退出 1，外层命令实际返回 126。另一次启动探查将基线通过仓外符号链接挂载，`firstWindow` 超时，返回 126，未采集样本。恢复实际 `out` 目录后开始交错。 [启动失败](/tmp/huhu-f09-pH/base1.log) · [基线日志 base2–base6 与实现日志 fast1–fast5](/tmp/huhu-f09-pH/)

## 持续输入和两个出口

每个构建、每个出口独立输入 160 个 ASCII 字符，使用同一 5,000 段夹具和 25 ms 按键间隔参数，记录浏览器实际派发的相邻 keydown。保存从 Mod+S 到磁盘包含完整文本，切源码从点击到 CodeMirror 显示完整文本。每侧各一个保存样本和切源码样本，供复核长停顿与出口耗时。

| 构建 / 出口 | 输入持续（s） | 键间隔中位 / p95 / 最大（ms） | 出口耗时（ms） | 返回码 |
| --- | ---: | ---: | ---: | ---: |
| 基线 / 保存 | 9.75 | 42.3 / 57.6 / 1868.0 | 1060.6 | 0 |
| 实现 / 保存 | 9.18 | 37.6 / 48.6 / 1945.4 | 1055.9 | 0 |
| 基线 / 切源码 | 11.25 | 42.8 / 82.4 / 1828.5 | 1490.9 | 0 |
| 实现 / 切源码 | 9.14 | 37.2 / 70.5 / 1777.1 | 1479.9 | 0 |

[持续输入驱动](/tmp/huhu-f09-pH/sustained.mjs) · [基线保存](/tmp/huhu-f09-pH/base-save.json) · [实现保存](/tmp/huhu-f09-pH/fast-save.json) · [基线切源码](/tmp/huhu-f09-pH/base-source.json) · [实现切源码](/tmp/huhu-f09-pH/fast-source.json)

## 其余验证

Playwright 全部使用 `--retries=0`，Vitest 使用零重试。表内通过的命令返回 0。

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| 等价性专项 `pnpm --filter @huhu/editor test:vendor paragraph-fast-path.test.ts --retry=0` | 36 通过 | [专项复跑](/tmp/huhu-f09-pH/focused-rerun.log) |
| `pnpm test` | 1006 通过，1 跳过 | [test.log](/tmp/huhu-f09-pH/test.log) |
| `pnpm test:vendor` | 6427 通过，4 跳过 | [vendor.log](/tmp/huhu-f09-pH/vendor.log) |
| `pnpm typecheck` | 通过 | [typecheck.log](/tmp/huhu-f09-pH/typecheck.log) |
| `pnpm lint` | 通过 | [lint.log](/tmp/huhu-f09-pH/lint.log) |
| `pnpm knip` | 通过 | [knip.log](/tmp/huhu-f09-pH/knip.log) |
| `pnpm format:check` | 通过 | [format.log](/tmp/huhu-f09-pH/format.log) |
| `pnpm build` | 通过，含 `check:ok-css`。提交后构建的 489 个 main、preload、renderer 文件与实测构建 SHA-256 完全一致 | [实测构建](/tmp/huhu-f09-pH/build.log) · [提交后构建](/tmp/huhu-f09-pH/build-final.log) · [实测哈希](/tmp/huhu-f09-pH/timed-bundle-sha256.txt) · [提交后哈希](/tmp/huhu-f09-pH/final-bundle-sha256.txt) |
| `pnpm notices` | 通过 | [notices.log](/tmp/huhu-f09-pH/notices.log) |
| `node scripts/ok-patches.mjs --check` | 0 未登记，0 多余 | [vendor-check-final.log](/tmp/huhu-f09-pH/vendor-check-final.log) |
| `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --refresh-replay` 后以相同 `OK_SRC` 执行 `--replay` | 固定上游重放 1348 个文件，集合和内容零差异 | [刷新](/tmp/huhu-f09-pH/vendor-refresh-final2.log) · [重放](/tmp/huhu-f09-pH/vendor-replay-final2.log) |
| 指定知识库 E2E | 102 通过，覆盖 `editor-*`、`comments-*`、`attachments`、`session-*`、`i18n-zh-hans`、`fidelity-local-edit`、`journey`、`compact-*` | [knowledge.log](/tmp/huhu-f09-pH/knowledge.log) |
| `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts --retries=0` | 6 通过，输入延迟 p95 11.0 ms | [perf-all.log](/tmp/huhu-f09-pH/perf-all.log) |
| `pnpm --filter @huhu/editor build:harness` + 独立 Chromium 浏览器 | Chromium 158.0.8127.18 通过，验证无桌面 preload 时的段落输入、重名锚点、代码高亮和源码同步 | [构建](/tmp/huhu-f09-pH/harness-build.log) · [浏览器](/tmp/huhu-f09-pH/browser.log) |

专项初跑 35 通过、1 失败。重挂载测试先读标签层子节点才插入标签，调整测试求值顺序后通过。局部类型检查曾报告 Placeholder 上游回调的 `this` 类型需要显式处理，补充针对 ProseMirror 已绑定回调的类型声明后通过。 [专项初跑](/tmp/huhu-f09-pH/focused.log) · [局部类型检查初跑](/tmp/huhu-f09-pH/editor-typecheck.log) · [局部类型检查复跑](/tmp/huhu-f09-pH/editor-typecheck-rerun.log)

已按 zh-modern-web-guidance 完成输入延迟搜索和指南获取。适配复用现有 ProseMirror 和 DOM 接口，并在 Electron 与独立 Chromium 浏览器路径验证。 [浏览器驱动](/tmp/huhu-f09-pH/browser.mjs)

## 阻碍与接续

本任务的改动和验证已完成。持续输入的最长键间隔仍见于上表。

## Lead 验收

Lead（2026-11-19）：接受。5 轮交错严格用例全过（p95 中位 10.6 ms），等价性 36 例、vendor 6427、重放零差异、补丁登记完整。持续输入的约 1.8 s 结算停顿两侧都有（main 既有），登记为后续。已 --no-ff 合入集成分支。
