# w5:p2 · task01.md · 文档会话与编辑器释放

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- 工作树 `/home/wta/projects/huhu-wt-w1`，分支 `closeout4/wp1`
- 执行状态 **完成**。
- 合并提交 `bcd44af`，父提交为 WP1 `a7365df` 和 WP7 `48b3c2d`。后续修复提交 `20cf299`、`e820442`、`8df0226`、`0d6df94`。交付分支 HEAD 为 `0d6df94`，未推送。

## WP1 · 文档会话、保存与释放

| 编号和子要求 | 复核原分类 | 结果及证据 |
| --- | --- | --- |
| OP-D03 最后引用双写失败 | 未实现 | 相同会话及最新正文可重试，保存确认后才清除注册。红测曾观察到注册表立即丢失，回归已通过。 `plugins/notes/test/document-session.test.ts:494` |
| OP-D03 无意规范化门禁 | 未实现 | 富文本保存忽略符合 OK 容差的无意规范化，显式源码字节、属性及链接照常保存。 `plugins/notes/test/document-session.test.ts:60`、`packages/editor/test/golden-roundtrip.test.ts:137` |
| OP-D03 停放引用所有权 | 缺验证 | 断言停放引用、另一视图共享同会话、驱逐只归还自己的引用。最后引用离开后释放。 `plugins/notes/test/document-session.test.ts:520` |
| OP-D03 编辑交付的 300 ms 防抖 | 未实现 | 待用户决定，见下节。 |
| A08 Vault 与父目录范围 | 未实现 | 按 Vault 和路径段结算全部相关会话。断言前缀边界、不同 Vault、失败阻止操作及重试。 `plugins/notes/test/document-session.test.ts:565` |
| A08 后台 MD/JSON 草稿迁移、活动 TXT 落盘、失败重试 | 缺验证 | 实际父目录移动测试已通过。断言首次失败原盘未变，重试的 TXT 字节正确，MD/JSON 草稿由旧路径迁到新路径且均能从原标签恢复。内部移动期间保留原标签，收到回执才应用实际路径映射。 `tests/e2e/knowledge/session-flush.spec.ts:170` |
| B09 切模式统一 flush、正文/属性/位置 | 未实现、缺验证 | 回执在途仍在旧模式，确认后才切换。富文本、源码、阅读实际显示一致，文档字节和滚动章节位置正确。 `tests/e2e/knowledge/session-flush.spec.ts:46`、`:141`、`tests/e2e/knowledge/editor-parity-shell-mounts.spec.ts:115` |
| B09 跨 Vault、文件和重开代次的迟到结果 | 缺验证 | 单测控制同路径跨 Vault 的迟到载入及保存，Electron 控制关闭旧文件后的旧读回执并核对另一篇、同路径重开、当前焦点及真实保存。 `plugins/notes/test/document-session.test.ts:449`、`tests/e2e/knowledge/session-flush.spec.ts:96` |
| C04 未保存属性→正文 | 缺验证 | 手动模式先改属性再立即输入正文。保存前原盘、成功后两处变化的完整字节均匹配。 `tests/e2e/knowledge/editor-s3-properties.spec.ts:103` |
| C06 只读 Markdown | 缺验证 | 真只读 Vault 的富文本与源码都拒绝输入，保存按钮不可用，原盘字节保留。 `tests/e2e/workflows/acceptance.spec.ts:324` |
| C06 正文 I/O 失败 | 缺验证 | 模拟 notes.save 非冲突失败，错误真实可见，末字仍在编辑器且原盘未变。重试保存成功。 `tests/e2e/knowledge/session-flush.spec.ts:235` |
| C06 外部移动、删除及恢复 | 缺验证 | 两个真实文件系统分支均通过。旧标签裁剪后的状态仍可见，旧路径草稿内容正确，恢复路径后可重开并点恢复草稿且原盘仍保留。停放读旧路径失败时，最后引用能完成释放的单测红→绿。 `tests/e2e/knowledge/session-flush.spec.ts:235`、`plugins/notes/test/document-session.test.ts:538` |
| F02 TXT 外改/冲突 | 缺验证 | 真实手动保存，分别断言保留本地编辑后明确写入、两步确认载入磁盘，以及各阶段的 UI/磁盘结果。 `tests/e2e/workflows/viewers.spec.ts:123` |
| F04 flush 成功才进入预览 | 未实现 | 失败保持源码、显示错误、原盘不变。重试后 iframe 显示 UI 修改的新标题，磁盘字节相同。 `tests/e2e/workflows/viewers.spec.ts:324` |
| F04/F10 迟到 HTML grant | 缺验证 | 关闭旧页并打开新页后才放回真实签发。旧签发被撤销，新 iframe 和内容保持。 `tests/e2e/workflows/viewers.spec.ts:384` |

## WP7 · 释放、泄漏与性能证据

| 编号和子要求 | 复核原分类 | 结果及证据 |
| --- | --- | --- |
| H06 后台停放与最后标签关闭 | 未实现 | 保留后台编辑器及会话引用，关闭最后相关标签才驱逐，被停放的 provider 可与其他视图共用 DocumentSession。真应用断言后台 Y.Doc/Tiptap/CM 仍存在，关标签后归零。 `packages/editor/src/host/provider-pool.ts`、`tests/e2e/knowledge/leak.spec.ts:14` |
| H06 自建和借入 Y.Doc | 未实现 | 自建文档恰好销毁一次，借入文档由调用者管理。单测通过。 `packages/editor/test/golden-roundtrip.test.ts:87`、`:98` |
| H06 运行时无网络 provider 和 IndexedDB | 缺验证 | 200 轮期间 WS、EventSource、额外 HTTP、IndexedDB 调用均为零。 `tests/e2e/knowledge/leak.spec.ts`、`leak-f10.json` |
| F10 逐轮开关与实例/observer | 缺验证 | 12 份笔记轮换，逐轮开关 200 次，1、12、20、50、100、150、200 轮检查点的 Y.Doc、Tiptap、CM、Y observer、编辑 DOM observer、活跃 worker 均为零。CDP 计数无法取得会失败。 `tests/e2e/knowledge/leak.spec.ts:68`、`:129` |
| F10 PDF worker、Object URL 与其他资源增长 | 缺验证 | 实际 PDF 打开会新建 worker，关闭后归零。总创建 403 个 worker，结束时活跃 0。导出实际创建 1 个 Blob URL，撤销 1 个，活跃 0。100→200 轮事件监听 587→587、节点 1965→1965、JS 堆 36,717,652→35,768,424 字节。真实 200 轮退出 0，约 5.7 分钟。 `/tmp/huhu-w5-e2e-recover-results/knowledge-leak-H06-F10：逐轮打开、切换并关闭笔记和预览（200-轮）/leak-f10.json` |
| F10 文件读取迟到 | 缺验证 | 保留当前标签、可编辑性及两份磁盘文件。Electron 已通过。 `tests/e2e/knowledge/leak.spec.ts:191` |
| F09 ≥10 万文件、1 MiB 长文、多批注三组分位 | 缺验证 | 三套夹具及采样驱动已提交，输出冷开、热切、输入、保存、Renderer/Engine 内存 p50/p95、机器、提交及样本量。按新任务纪律留给 Lead 运行。 `tests/e2e/perf-note-journey.ts:18`、`tests/e2e/perf.spec.ts:350` |
| H05 任务描述和收件想法的编辑实例成本 | 缺验证 | 已提供两个真实入口的挂载前堆、可编辑时刻与挂载后堆探针。想法入口依赖 pP 的 compact 编辑功能合入候选。按新任务纪律留给 Lead 采样，预算依既定 Q4。 `tests/e2e/knowledge/compact-cost.spec.ts:54` |
| H07 首次和后续 git hunk | 缺验证 | 临时 Git Vault 里两次保存各只改动单个目标文件的单个 hunk，核完整字节与重开表格、列表。仅忽略应用自动产生的运行文件及指南。Electron 通过。 `tests/e2e/knowledge/fidelity-local-edit.spec.ts:34` |

## 改动边界

- 合并冲突集中在 provider 池和 RichMarkdownEditor。采用 WP7 的显式租约和关闭时序，加上 WP1 的会话引用桥。按已提交的文件/档案标签集合判断最后一次关闭。
- 工作包目录之外的必要接线包括 `packages/editor/src/rich/`、`plugins/notes/src/engine/{index,service}.ts` 的原子草稿迁移，及 `NoteExplorer.tsx`、`explorer/{ResourceTree,filesDeps}` 的路径保留透传。正常移动及拖放/原位改名得到同一逻辑，实测移动触发了索引早于回执的竞态。
- vendor 除原 WP7 的 `editor-cache.ts` 补丁外，补了 `awareness-heartbeat.ts` 的 ticker 停止时机。登记 PATCHES.md 并由脚本更新两个重放产物，未手改生成物。

## 验证与重跑

- `pnpm build`（含 `check:ok-css`）最终退出 0，A/B/C 冲突均为 0。 `/tmp/huhu-w5-build-move.log`
- `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --refresh-replay` 和 `node scripts/ok-patches.mjs --check` 均退出 0，未登记/多余登记均为 0。 `/tmp/huhu-w5-{replay,patches}-fix.log`
- 最终 HEAD 的 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm knip`、`pnpm notices` 均退出 0。 `/tmp/huhu-w5-*-head.log`
- 最终 HEAD 的 `pnpm test --maxWorkers=2 --minWorkers=1 --testTimeout=20000 --hookTimeout=20000` 退出 0，Vitest 1,015 通过、1 跳过，OK CSS 脚本单测也通过。早期全仓首轮有 1 个外部扩展启动测试超时及临时 writer.lock 清理错误，外层退出 126，1,013 通过、1 跳过。提高总测试和 hook 上限后，全仓中间复跑 1,014 通过、1 跳过，最终新增回归使通过数增加到 1,015。 `/tmp/huhu-w5-test-head.log`
- 最终 HEAD 的 `pnpm test:vendor --maxWorkers=2 --minWorkers=1` 退出 0，6,427 通过、4 跳过。早期 vendor 首轮有 1 个依赖树扫描超时，外层退出 126，6,426 通过、4 跳过，于负载 3.99 单独复跑该 spec 10 条全过，最终全仓 vendor 已全绿。 `/tmp/huhu-w5-vendor-head.log`
- `pnpm exec vitest run plugins/notes/test/explorer-deps.test.ts plugins/notes/test/document-session.test.ts --maxWorkers=2 --minWorkers=1` 退出 0，45 条通过。关闭缺失文件的会话竞态先有 1 条红测，修正后相关 DocumentSession 35 条均通过。另有 3 项 heartbeat 纯断言通过。
- 独立 Chromium 158.0.8127.18 验证共享模式钩子在无 Electron preload 下失败留在源码及成功切换。Mock transport 的小型浏览器检查，完整产品证据来自 Electron。

| Electron 批次 | 退出码和计数 | 记录 |
| --- | --- | --- |
| 首轮统一功能用例（11 个相关 spec） | Playwright 1 / pnpm 126，18 通过、17 超时 | 单 worker、零重试。用例总数 35，负载 31.56→15.66。 `/tmp/huhu-w5-e2e.log` |
| 复跑 17 条超时用例 | 1，12 通过、5 失败 | 只选首轮失败用例。等待其他 Electron/Playwright 退出，负载仍 20.33，按新任务的进程互斥规则使用该时隙，120 秒用例上限。确认 H07 生成文件、H06 心跳 Worker、A08 目录登记及 C06 裁剪行为。 `/tmp/huhu-w5-e2e-retry.log` |
| 修复后复跑 5 条 | 1，1 通过、4 失败 | `20cf299`。H07 通过。H06 通过首次 PDF 释放检查，后续遇到树行刷新。A08 对话框报错定位重复，C06 暴露提示及恢复步骤竞态。 `/tmp/huhu-w5-e2e-fix.log` |
| 复跑 4 条 | 1，1 通过、3 失败 | `e820442`。H06/F10 200 轮完整通过。A08 到达 JSON 草稿恢复步骤，标题定位重复。C06 通过 I/O 重试与外部移除状态，重开时缺少草稿提示。 `/tmp/huhu-w5-e2e-recover.log` |
| 复跑 3 条 | 1，2 通过、1 失败 | `8df0226`。C06 两条已通过，A08 暴露索引先裁剪旧标签的问题。负载 4.91→2.92。 `/tmp/huhu-w5-e2e-durable.log` |
| 最后复跑 A08 | 0，1 通过 | `0d6df94`。单 worker、零重试，移动失败重试、原标签保留与两份草稿恢复均通过。 `/tmp/huhu-w5-e2e-move.log` |

35 条相关功能用例逐条取得通过记录。每轮启动前查无其他 Electron 或 Playwright 运行进程。通过的用例没有加入后续复跑。按用户新任务要求没有运行全量 Electron 用例或 F09/H05 性能采样。

## 待用户决定

- OP-D03 编辑交付时机。保留每批事务的微任务，可让正文先于紧随其后的属性与退出操作进入会话。800 ms 自动保存及上层 300 ms 界面刷新各自独立。若使用原规格字面的 300 ms 交付，可减少交付次数，同时需要确认属性、保存、切换和关闭入口都主动排空这段等待。本次保留微任务，待用户决定是否修订规格或实现。

## Lead 集成工作

- 运行 F09 的三场景正式测量与 H05 两类实例成本，收件想法覆盖 pP 实际合入的入口。
- 合并工作树后重新生成合并候选的 vendor 重放，执行集成候选的全量 E2E 与性能门禁。

- 2026-11-20 Lead：接受，待集成后复验。首轮高负载 17 条超时，之后只重跑失败项共 5 轮直至 35 条全部有通过记录，如实记录。OP-D03 交付时机交用户；F09/H05 正式采样由 Lead 在集成候选上空闲时运行。
