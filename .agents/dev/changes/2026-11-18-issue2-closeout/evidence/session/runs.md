# 验证记录

环境为 Linux、Electron 44.9.1、pnpm 12.10.1、Xvfb。除明确列出的 Vitest 环境变量和命令参数外，沿用项目默认值。下面退出码是 shell 外层观察值。pnpm 在这些测试失败时返回 126，命令输出里的 Playwright 或 Vitest 返回 1。原始日志和失败 trace 位于本机 `/tmp/huhu-issue2-session/`。

## 标准检查

| 命令 | 运行经过 | 日志 |
| --- | --- | --- |
| `pnpm typecheck` | 基线 0。新增测试直接类型引用 vendor 源时暴露默认 tsconfig 没有该路径映射，后改用测试所需的结构类型和已有 Vite 别名。另修正 Vite 动态模块类型断言、档案路由联合类型收窄。过程失败均记录，最终结果见下面的汇总。 | `typecheck.log`、`final-typecheck.log`、`verified-typecheck.log`、`typecheck-clean.log`、`typecheck-final.log`、`typecheck-confirmed.log` |
| `pnpm lint` | 三代运行均退出 0。 | `lint.log`、`final-lint.log`、`verified-lint.log` |
| `pnpm test` | 基线 0。最终业务修复后 82 文件通过，1 跳过，976 用例通过，1 跳过，退出 0。 | `test.log`、`final-test.log`、`verified-test.log` |
| `pnpm build` | 基线、E04 修复及 E05 修复后的构建均退出 0。 | `build-early.log`、`build.log`、`build-fix.log`、`final-build.log`、`build-e05.log` |
| `pnpm format:check` | 首轮运行时新增黄金测试尚未格式化，退出 126。用 `pnpm exec oxfmt` 格式化变更文件后，两次检查退出 0。 | `format:check.log`、`final-format:check.log`、`verified-format:check.log` |
| `pnpm knip` | 三代运行均退出 0。 | `knip.log`、`final-knip.log`、`verified-knip.log` |

## 定向检查

除明确注明外，Electron 命令前缀为 `xvfb-run -a pnpm e2e`，每批另传 `--output=/tmp/huhu-issue2-session/<批次>-results` 避免覆盖其他批次的 trace。

| 命令或参数 | 结果 | 日志 |
| --- | --- | --- |
| `pnpm exec vitest run packages/editor/test/golden-roundtrip.test.ts` | 首次默认 Vitest 加载找不到上游别名，退出 126。测试改用同源 Vite 别名后，强制全部大档进入富文本的两轮均为 123/123 断言通过，但 Vitest worker 的 `onTaskUpdate` RPC 超时，退出 126，第二轮附带 `VITEST_MAX_THREADS=1`。 | `golden.log`、`golden-vite.log`、`golden-repeat.log` |
| `pnpm exec vitest run packages/editor/test/golden-roundtrip.test.ts plugins/notes/test/document-session.test.ts` | 改用桌面端默认大档加载路径后，2 文件、144 用例通过，退出 0。 | `session-unit.log` |
| `tests/e2e/workflows/archives-tabs.spec.ts -g '^E04 同一' --repeat-each=20` | Playwright 用带文件/分组前缀的完整标题匹配，锚定过滤未匹配，0 条，退出 126。 | `e04-baseline.log` |
| `tests/e2e/workflows/archives-tabs.spec.ts -g 'E04 同一' --repeat-each=20` | 两路 CPU 竞争下，基线 16 通过 / 4 失败，退出 126。E04 修复后 20 通过，退出 0。 | `e04-baseline-20.log`、`e04-fixed.log` |
| `tests/e2e/workflows/archives-tabs.spec.ts -g 'E04 在途'` | 基线持有真实写入请求让字段抢先，导致磁盘正文缺失，1 失败，退出 126。 | `e04-red.log` |
| `tests/e2e/workflows/archives-tabs.spec.ts tests/e2e/workflows/viewers.spec.ts tests/e2e/knowledge/session-persistence.spec.ts tests/e2e/knowledge/compact-cost.spec.ts -g 'E04 在途\|F03\|H01\|C05\|S2c'` | E04、F03 ×3、H01、C05 均通过。S2c 任务评论提交了旧内容「撤」，共 6 通过 / 1 失败，退出 126。 | `targeted.log` |
| `tests/e2e/knowledge/{comments-persistence,explorer-keyboard,compact-cost}.spec.ts tests/e2e/workflows/archives-tabs.spec.ts -g 'A06\|A07\|D01\|D06\|E05\|S2c'` | 1 通过 / 5 失败，退出 126。评论移动夹具缺少目录索引，浏览器本地排序导致 A06 定位到错误的行，A07 移入后代的夹具缺少索引。E05 点击真实附件误开 Markdown，S2c 再次提交旧内容。 | `targeted-2.log` |
| `tests/e2e/knowledge/comments-persistence.spec.ts -g 'D01'` | 增加可索引的文件后，移动和评论磁盘更新通过。随后测试在重绘期间抓到旧行导致超时，退出 126。 | `comments-repeat.log` |
| `tests/e2e/knowledge/explorer-keyboard.spec.ts -g 'A06\|A07'` | A07 通过；A06 已通过键盘与子菜单，右键位置恰被行内按钮遮挡，未触发右键。1 通过 / 1 失败，退出 126。 | `explorer-repeat.log` |
| `tests/e2e/knowledge/{comments-persistence,explorer-keyboard}.spec.ts tests/e2e/workflows/archives-tabs.spec.ts -g 'A06\|A07\|D01\|D06\|E05'` | 修正定向驱动及 E05 后，5 通过，退出 0。 | `targeted-3.log` |
| `tests/e2e/knowledge --grep 'S2c：任务评论\|S2b：重开应用后\|D01/D02\|A06 行内' --repeat-each=3` | 11 通过 / 1 失败，退出 126。任务评论、既有知识库评论和 A06 各 3/3。既有 S2b 应用退出落盘 2/3，其中一次只落了部分正文。 | `retries.log` |

夹具核验用 `gs -q -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dEncryptionR=3 -dKeyLength=128 -sOwnerPassword=owner-fixture -sUserPassword=reader-fixture` 生成 PDF 1.4。无密码 `pdfinfo` 报密码不正确，使用夹具密码得到 1 页且 `Encrypted: yes`。

## 全量 Electron

命令为 `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows`，原始日志分别为 `full-e2e.log` 和 `full-final.log`。两轮均发现 100 条用例。第一轮期间另有一次构建和测试变动，第二轮固定同一构建。

| 批次 | 通过 | 失败 | 跳过 | 退出码 |
| --- | ---: | ---: | ---: | ---: |
| 第一轮 | 91 | 8 | 1 | 126 |
| 第二轮 | 98 | 1 | 1 | 126 |

第二轮唯一失败是既有 `editor-s2b.spec.ts` 的退出写盘用例。键入「关闭前的最后输入」后直接关闭，磁盘只有「初始关」并出现额外的标题尾符号。第一次完整执行、第二次完整执行及三次单独复跑中的一次出现相同症状。任务评论在第二轮通过，三次独立复跑均通过。唯一跳过的是项目默认不开启的十万文件 Vault 用例。第一轮有一次应用已启动但停在欢迎页，未将其计作 `electron.launch` 失败。

## 候选版

- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm format:check`、`pnpm knip` 均为 0，对应 `candidate-*.log`。测试为 82 文件通过，1 跳过，976 用例通过，1 跳过。
- `xvfb-run -a pnpm e2e tests/e2e/workflows/acceptance.spec.ts -g 'ACC-TK-06|切换笔记再切回' --repeat-each=3`。第一轮全量中的两个既有用例单独复跑，撤销历史 3/3，任务 @ 用例 0/3，后者在编辑器中显示 `Research/` 后，保存的任务详情没有「引用」区。命令退出 126，第二轮全量中两条都通过。日志 `workflow-retries.log`。
- `xvfb-run -a pnpm e2e tests/e2e/knowledge/{comments-persistence,explorer-keyboard,session-persistence}.spec.ts tests/e2e/workflows/{archives-tabs,viewers}.spec.ts -g 'A06|A07|C05|D01|D06|E0[1-5]|F03|H01'`。候选构建 15 通过，1 失败，退出 126。E04 的受控用例已验证写盘双改动，失败发生在关闭两标签后直接定位文件时。同一版本的后续测试改用档案入口重开。日志 `candidate-targeted.log`。
- `xvfb-run -a pnpm e2e tests/e2e/workflows/archives-tabs.spec.ts -g 'E04 同一' --repeat-each=20`。候选构建再次在两路 CPU 竞争下 20/20，退出 0。日志 `candidate-stress.log`。
- 另外比对 16 个上游数据文件，Markdown 文件字节相同，JSON 容器的解码内容相同。
- `xvfb-run -a pnpm e2e tests/e2e/workflows/archives-tabs.spec.ts -g 'E04 在途' --repeat-each=3`。第一次显式返回文件区重开，已展开的类型行偶尔缺少子行，2/3，退出 126。第二次改从档案页重开，两处落盘和 Markdown 重新渲染 3/3，退出 0。日志 `candidate-e04-regression.log`、`candidate-e04-reopen.log`。
- 最后修整测试重开路径后，重新检查 `pnpm lint`、`pnpm format:check`、`pnpm knip` 均退出 0。日志 `final-reopen-*.log`。
- 以相同候选版定向组合命令重跑最终测试，16 执行、16 通过、0 跳过，退出 0。日志 `candidate-reopen-all.log`。

## task02 的 C06 与 H05 修复

日志、失败 trace 和 Playwright 状态文件位于 `/tmp/huhu-issue2-session-02/`。基线用 `290e8f7` 的应用构建，最终验证用同一份修复后应用构建。基线和修复版的可观察行为见 [c06-h05-fix.md](c06-h05-fix.md)。

| 命令或批次 | 实际结果 | 日志 |
| --- | --- | --- |
| 基线执行 `xvfb-run -a pnpm e2e tests/e2e/knowledge/{session-flush,compact-submit}.spec.ts` | 1 通过、6 失败。自动保存退出、Vault dirty 枚举、两个发表入口及撤销到空有明确的行为差异。手动草稿用例在重启后定位旧文件树行失败，修复版改走实际文件搜索入口。 | `red-proper.log` |
| `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`pnpm build`、`pnpm format:check`、`pnpm knip` | 各项退出 0。项目测试 82 文件通过、1 跳过，980 条通过、1 跳过。vendor 167 文件通过，4173 条通过、2 跳过。 | `final-typecheck.log`、`final-lint.log`、`final-test.log`、`vendor.log`、`build-stable.log`、`final-format:check.log`、`final-knip.log` |
| 修复后定向运行新回归、`editor-s3-large.spec.ts`、B07 与 `ACC-TK-06` | 11 条通过，1 条失败发生在 Vault 用例等待原先假定的启动页。验证目标 Vault 的路径后改从实际最近列表切回，单独 3/3；再由全量和压力批次通过。 | `final-targeted.log`、`vault.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/{session-flush,compact-submit}.spec.ts --repeat-each=10 --workers=2` | 每条回归 10/10，共 80 通过，Playwright 最终状态 `passed`。机器 8 核，此批开始时 1 分钟负载 46.75，同时运行本 worktree 的全量与另两个 worktree 的 Electron 套件。外层包装器结束后 Playwright 子进程仍运行到终点，使用其总结与 `.last-run.json` 核验。 | `stress.log`、`stress-load.log`、`stress-results/.last-run.json` |
| 驱动最后调整后重跑 `pnpm lint`、`pnpm format:check` | 均退出 0。 | `post-driver-lint.log`、`post-driver-format:check.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows` | 第一轮 105 通过、2 失败、1 默认跳过，Playwright 退出 1，pnpm 外层 126。新回归、S2b 退出落盘、两条大文档、B07 和 `ACC-KN-02`、`ACC-WB-03`、`ACC-TK-06` 均通过。两个失败用例在「已保存」文本匹配后直接读盘，分别缺「追加正文」及「切回后继续写」。 | `full.log`、`full-results/` |
| 对 `editor-s3-properties.spec.ts` 和 `journey.spec.ts` 的失败用例单独 `--repeat-each=3 --workers=1` | 属性用例 3/3，完整旅程 1/3。旅程一次重复缺少最后正文，另一次在切换文件后等待「不会被编辑」超时。未将失败归为同一根因。 | `full-retries.log`、`full-retries-results/` |
| 临时读盘观测，各 3 次 | 用原行为驱动加 50 ms 轮询，5 次稳定读到了预期正文，且这 5 次第一次读取就已匹配。另一次旅程较早等待 `.cm-content` 超时。未捕捉到从读旧到读新的窗口，无法据此证明原失败全是断言时序；临时探针已移除。 | `disk-diagnostic.log`、`disk-diagnostic-results/` |
| `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '打开 1 MiB\|编辑输入延迟'` | 第一轮两条都在采样前超时。1 MiB 等待引擎就绪超时，输入用例等待富文本挂载超时。1 分钟负载从 10.19 升到 65.04，未测得指标。 | `perf.log`、`perf-load.log` |
| 同一严格性能子集，负载回落后 `--repeat-each=3 --workers=1` | 5 通过、1 超阈值。1 MiB 是 409 / 420 / 425 ms，5000 行输入 p95 是 14.9 / 18.6 / 15.0 ms，每组 80 样本。仍有一个 worktree 在跑 Electron。 | `perf-lower.log`、`perf-lower-load.log` |
| 再次执行指定的严格性能子集 | 2/2，退出 0。1 MiB 为 413 ms，5000 行输入 p95 为 13.8 ms、最大 26.9 ms，80 样本。1 分钟负载开始 3.05、结束 5.24；一个 worktree 的 Electron 套件仍运行。 | `perf-final.log`、`perf-final-load.log` |
| 第二轮全量 `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows --retries=3` | 107 一次通过、1 默认跳过、0 重试、0 失败，退出 0。属性和完整旅程均在首轮尝试通过。独立成本样本 30 条、30 实例、1,480 ms、堆增量 37 MB。 | `full-rerun.log`、`full-rerun-results/.last-run.json`、`full-rerun-load.log` |
| 无其他 Playwright runner 时，重新执行指定的严格性能命令 | 2/2，退出 0。1 MiB 到可编辑 413 ms，5000 行输入 p95 14.1 ms、最大 23.2 ms，80 样本。8 核主机 1 分钟负载开始 1.07、结束 1.20，开始前 CPU 压力 `avg10=0.00`。 | `perf-idle.log`、`perf-idle-load.log` |

## task03 独立审查修复

集成点为 `03dc93b`，本工作分支先合入后的基线为 `4300e30`。原始日志与 trace 位于 `/tmp/huhu-session-03/`。重启后 test-results/ 中的 .last-run.json 属于旧运行，task03 使用单独输出目录。重启前在途的绿色单测、构建、类型与补丁登记命令均重新执行。

| 批次 | 结果 | 日志 |
| --- | --- | --- |
| 基线 Electron 与 Vitest | A06 英文定位、档案直接退出最后一笔、手动切视图原文件不变均判红。带焦点拦截的切 Vault 基线漏报待保存档案。两个 drainer 场景均未保住快照，两个资产边界场景也未达成约定。 | `red.log`、`red-vault.log`、`red-drainer.log`、`red-assets.log` |
| 首轮集成构建后的定向 Electron | 10 通过、3 失败。切 Vault 在确认后进入重载，原驱动取到已销毁的 context。另两项触发 E04 旧的等待前提与字段写入后旧会话版本。A06、三项 F03、同尺寸替换、档案无失焦退出和手动保存用例通过。 | `targeted.log` |
| 队列修复后的定向 Electron | 6 通过、1 失败。档案退出、切 Vault、手动视图、取消迟到导航、两项 E04 均通过。原有档案删除用例等待返回类型页超时。 | `verify-focus.log` |
| 会话与资产单测 | 3 文件、37 条通过。包括 drainer 先拒绝但等其它端口、销毁清理、在途档案条件写与新正文合并、受保护真实目标、拒绝同尺寸替换和尾段长度。 | `verify-session.log` |
| 类型、lint、补丁登记、构建、格式、knip | `pnpm typecheck`、`pnpm lint`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check`、`pnpm knip` 最终均退出 0。登记 203 项，遗漏和多余各 0。 | `verify-typecheck.log`、`delivery-lint.log`、`verify-patch.log`、`delivery-build.log`、`delivery-format.log`、`delivery-knip.log` |
| 首轮 `pnpm test` | 994 通过、2 失败、1 跳过。四条大样本富文本均通过。Engine 子进程 ready 超时单独 3/3，Vault 监听收到原子写临时文件两次，单独 2/3。 | `verify-test.log`、`retry-engine-{1,2,3}.log`、`retry-watcher-{1,2,3}.log` |
| `pnpm test:vendor` | 首轮 6008 通过、1 失败、4 跳过，依赖树扫描超时且 worker RPC 超时；依赖树单独 3/3。完整复跑 290 文件、6009 通过、4 跳过，退出 0。两轮均将 Vitest forks / threads 限定为 2。 | `final-vendor.log`、`retry-vendor-{1,2,3}.log`、`delivery-vendor.log` |
| 既有档案删除用例单独三次 | 2 通过、1 失败，失败时仍显示删除档案对话框。其他档案回归另有独立证据。 | `retry-delete.log` |
| 完整复跑 pnpm test | 85 文件通过、1 跳过；996 条通过、1 跳过，退出 0。四个大样本实际完成构建富文本、序列化和第二会话读取。 | `delivery-test.log` |
| 全量中的单独复跑 | D03/D04/D05 3/3，S2b 3/3。Embed 与格式气泡各 0/3，在本地化定位处超时。斜杠菜单矩阵 2/3，仍有一次找不到 listbox。属性用例 2/3，失败时读盘缺「追加正文」。 | `full-first-retries.log`、`retry-s2b.log`、`retry-matrix.log`、`retry-properties.log` |
| 全量 Electron | 指定命令执行 146 条，137 通过、8 失败、1 跳过，Playwright 退出 1，pnpm 外层 126。跳过项为默认关闭的十万文件 Vault。档案退出、切 Vault、手动保存、迟到导航、A06、E04、F03 和同尺寸附件替换全部通过。 | `full.log`、`full-results/.last-run.json`、`full-load.log` |
| 其余失败复跑 | H03 3/3。F04 原驱动 1/3，替换预览 iframe 时旧 frame 已经脱离，改为通过 FrameLocator 查找当前 iframe 后 3/3，继续要求读到「已更新页面」。F04 只修改测试驱动，使用同一应用构建。 | `retry-h03.log`、`retry-f04.log`、`verify-f04.log` |
| F04 驱动改动后 | `pnpm lint`、`pnpm format:check` 各退出 0。 | `post-driver-lint.log`、`post-driver-format.log` |

全量门槛仍未通过。独立审查已将一直失败的 Embed 与下划线气泡英语选择器交 w4:pA。本轮也保留斜杠菜单和属性保存各 2/3 的失败证据。运行生成的归档内 matrix-run.json 已恢复为仓库版本，副本留在本次日志目录。

## task04 属性保存与 D01

原始日志、临时探针及 Playwright 结果目录位于 /tmp/huhu-session-04/。临时探针已从工作区撤出。比较两份相同的原属性用例，均单 worker，连续使用四路 nice -n 5 的 CPU 工作进程。主分支使用构建标识为 9f870c0 的产物。任务分支使用 task03 最终源码对应的桌面构建。

| 命令或批次 | 结果 | 证据 |
| --- | --- | --- |
| 原属性用例，task03 的 b147410 | 20/20，失败率 0/20。 | old-branch.log、old-branch-load.log |
| 同一原用例，main 9f870c0 | 9/10，失败率 1/10。失败在 C03 正文输入后第一次读文件，与 task03 的失败行、已更新标题和未更新正文一致。 | old-main.log、old-main-results/ |
| 属性正文、C04 合并与批注重开受控探针，各 3 次 | 9/9。慢桥时 DOM 有末字、源缓冲和磁盘无末字；提交属性后完整正文与属性同次写入。保留打开状态的批注面板在笔记读取期间暂不可见，旧驱动随后点击关闭它。 | probe.log、probe.spec.ts |
| 保留原自动保存路径的定时探针 | 3/3。旧「已保存」取样到发出含新正文的写请求相隔 3,405、3,087、3,185 ms，最终全文读盘一致。时间包含人为延迟，用来识别事件顺序。 | timed.log、timed.spec.ts |
| 集成 03dc93b 上的 D01 原用例 | 无拦截重跑 3/3。历史失败仍由集成 trace 和受控探针说明。 | old-comments.log、集成历史 trace |
| 改后两个 spec 的定向 Electron | 4/4，包含 D01 关闭重开和真实慢桥 C04。 | targeted.log |
| 改后属性原流程压力复跑 | 同样四路 CPU 工作进程，10/10。该批次同时运行最终全量，环境负载与基线各轮有所波动。 | updated.log、updated-load.log |
| 六项门禁 | pnpm typecheck、pnpm lint、pnpm test、pnpm build、pnpm format:check、pnpm knip 均退出 0。单测 996 通过、1 跳过，Vitest workers 限定为 2。 | checks、test.log、typecheck.log、lint.log、build.log、format.log、knip.log |
| 全量 Electron | xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows。144 通过、2 失败、1 默认跳过。两项失败均在 editor-parity-closeout-remaining.spec.ts，等待英文 Embed 选项和 underline 按钮超时，归 w4:pA。属性、C04、D01 和上一轮偶发失败的斜杠菜单矩阵均通过。 | full.log、full-results/.last-run.json、full-load.log |

两条基线分支的属性用例 Git blob 都是 745484021df62ef42752af149a1313adfda02e9a。task03 的桌面产物在提交前构建，构建标识为当时的 HEAD 4300e30，代码随后提交至 8c5bf81 和 b147410。测试写出的归档 matrix-run.json 已恢复，生成版保存在日志目录。
