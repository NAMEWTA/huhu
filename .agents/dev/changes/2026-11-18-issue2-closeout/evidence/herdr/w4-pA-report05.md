# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pA
- task：task05.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task05.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report05.md
- 执行结果：blocked

## 结论

六项审查修复已提交，均通过对应专项。同步后先复跑 task04 的相关用例，拖放和目标标签的关闭、重开继续通过，Embed 和格式气泡的英文定位各失败一次。改为中文界面定位后，三项在默认 Electron 全量中均通过。

任务整体仍有门禁。默认知识库全量为 84 通过、3 失败、1 跳过。F09 三次空闲复跑都满足 1 MiB 打开门槛，但输入 p95 均超过 16 ms。

## 产物与改动

- 工作目录为 `/home/wta/projects/huhu-wt-parity`，分支为 `closeout/issue2-parity`，最终提交为 `b75dc3e8fd2e7f6fd6ff4abd4fbbe758b3d4d6fc`，工作树干净。开工同步 `03dc93b` 的合并提交为 `ba82498`。合并保留集成布局，`8116633` 接回 task04 的源码定位回调。
- 实现提交 `0f69158512323f0b816433919d1ee20ad03fea53`。B06 在原生编辑输入和命令处理之前，按 DOM 快照变化调用 ProseMirror 自有的选区同步入口，并避开 IME 组合。新增正文附件、图片、双链的目标菜单，接到 DocTab、文件树定位和剪贴板。
- 本地模板导入使用 Vault 内同级的「模板」目录保存 Markdown 副本，保留源文件。已验证目标副本可以保存编辑、关闭和重开。导入读取已落盘内容，创建副本与保存内容分两步，保存中断时可能留下空白模板。
- 新迁入 39 个上游 DOM 文件。适用性清单覆盖固定上游全部 596 个 DOM 文件，逐项给出目标路径或理由，包含 89 个集成基线的同名候选。最终合计 77 个原样迁入、8 个适配迁入、511 个不适用。
- 证据位于 `/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/`。已更新 `parity-82.md` 和 `runs.md`，新增 `review-fixes.md`、`endpoint-matrix.md`、`dom-tests-applicability.md`、`vendor-replay.json` 和 `vendor-replay.patch.gz`。模板和双链打开后的正文等待修订见 `3ef9e63`。

## 验证

原始日志、Playwright 失败 trace 和复跑目录在 `/tmp/huhu-parity05-dE9NZJ/`。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| B06 快速换选区 | 四路集成基线 12 次中 6 次丢失后段。初版修复 12 次全过。最终优化版本四路 9 次通过、3 次达整用例超时。单项复跑 3 次均通过，最终版本在负载下累计通过 12 次。断言实际 DOM 选区、原段、下划线及磁盘。默认套件中的 B06 和 IME 组合同样通过。 | `b06-red-*.log`、`b06-green-*.log`、`b06-delivery-*.log`、`b06-retry-*.log` |
| B01 和模板 | 真实 Electron 验证复制附件路径、图片树行定位、键盘双链菜单、焦点归还、打开目标，以及模板导入落盘、保存和重开。模板在组合复跑中一次挂载超时，正文等待修订后独立三次通过。独立 Chromium 上也通过 B06 和双链菜单。 | `domain-delivery.log`、`template-retry-*.log`、`browser-check-final.log` |
| Embed、格式气泡、拖放 | 集成前提已复核。最终使用中文命令及气泡名称，拖放按目标标签和正文验证关闭、重开。默认全量三项均通过。 | `integrated-baseline.log`、`e2e-knowledge-delivery.log` |
| `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`pnpm notices` | 全部退出 0。声明生成 1,402 项，生成物写入日志目录。 | `typecheck-delivery.log`、`lint-delivery.log`、`build-delivery.log`、`format-check-final.log`、`knip-delivery.log`、`notices-delivery.log` |
| `pnpm test` | 首轮 4 项超时，每轮独立复跑四项、连续三轮均通过。完整复跑 987 通过、1 跳过，退出 0。 | `test-delivery.log`、`root-retry-*.log`、`test-final.log` |
| `pnpm test:vendor` | 330 文件，6,391 通过、4 跳过，退出 0。 | `test-vendor-delivery.log` |
| G01/G02 登记和固定来源重放 | 差异登记 249 条，无缺项或多余登记。从固定 `44a2e0a` 重放 1,343 个文件，文件集合和字节零差异。两项均退出 0。 | `patches-delivery.log`、`replay-delivery.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 默认单 worker、零重试。84 通过、3 失败、1 跳过，退出 126。A06 和 H03 分别单独重跑三次，均复现。完整旅程单独三次，1 失败、2 通过。A06 的临时中文定位副本整条通过。 | `e2e-knowledge-delivery.log`、`knowledge-retry-*.log`、`a06-chinese-final.log` |
| F09 严格性能，空闲三次 | 1 MiB 为 186、194、442 ms，输入 p95 为 34.3、25.2、28.3 ms，各 80 样本。起跑前 1 分钟负载 3.40、2.96、3.43，两次连续采样为 86%–97% idle。三轮均因输入 p95 超过 16 ms 退出 126。 | `perf-quiet-*.log`、`perf-quiet-*-load.log`、`perf-quiet-*-cputimeline.log` |
| F09 同构建诊断 | 交替测试 10 次，每种条件 5 次。在其中一组临时移除本任务的选区监听。带守卫与移除守卫各轮 p95 的中位数分别为 26.7 和 26.8 ms，范围重叠，两组均超限。该对照未检出选区守卫带来的可测差异。 | `perf-guard-paired.log` |

## 阻碍与接续

- A06 原用例在 `explorer-keyboard.spec.ts:70` 查找 `Options`，实际可达名称是「文件操作选项」。H03 扫出编辑器通知区域的英文 `Notifications alt+T`。两处需要在对应负责范围内修复后复跑。
- 完整旅程在默认全量中缺少切回后的落盘文本。单项失败轮较早停在关闭 JSON 后的只读正文断言。需在包含会话分支后验收旅程和默认全量。
- F09 在同构建中带守卫与移除守卫均超限，独立审查的集成基线也测得 17.9 ms。仍需在合并候选上定位输入链路的尾延迟，复跑严格门禁。合入其他 vendor 改动后需刷新来源清单和重放补丁并再次核对零差异。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过（本任务的六项修复）**。A06 的定位已由 w4:pC 在 session 分支改好；完整旅程的问题由 w4:pC/task05 查明是测试时机，已修；通知区英文转 w4:pB/task05；F09 回退转 w4:pD/task02 做疑难分析。集成后已用 `--refresh-replay` 刷新重放清单，校验 1346 个文件零差异（集成提交 80d873f）。
