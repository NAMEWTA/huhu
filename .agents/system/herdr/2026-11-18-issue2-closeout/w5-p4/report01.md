# w5:p4 / task01.md 合并工作包回报

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- 工作树 `/home/wta/projects/huhu-wt-w4`，分支 `closeout4/wp4`，交付提交 `c7da2fb`，合并提交 `022f447`
- 接续自 `w4:pV/task01.md` 与 `w4:pS/task01.md`。合并冲突保留两边的依赖与详情面板，vendor 重放产物从固定上游重新生成。

## WP4 文件树、标签、列举与图标

| 复核编号 | 原分类 | 现状态 | 断言与证据 |
|---|---|---|---|
| A01 | 缺验证 | 已验证 | 真实树同时显示普通笔记、点目录、业务目录、空目录、未知后缀及非 MD；展开嵌套 Tasks，见 `tests/e2e/knowledge/journey.spec.ts:111`。 |
| A02 | 缺验证 | 已验证 | 关闭重启应用后目录仍隐藏，从管理入口恢复，验证子项与偏好内容，见 `tests/e2e/knowledge/journey.spec.ts:258`。 |
| A03 | 缺验证 | 已验证 | 隐藏后原标签编辑可保存、双链和命令搜索仍能打开，偏好保持；同一旅程也验证了隐藏项可用 @ 插入，见 `tests/e2e/knowledge/journey.spec.ts:131`、`:258`。 |
| A04 | 缺验证 | 已验证 | 树标记超页仅部分加载，同时真实编辑器从独立索引选中第 24,999 项并写入完整链接，见 `tests/e2e/knowledge/huge-vault.spec.ts:65`。 |
| A05 | 缺验证 | 已验证 | 应用挂载期间外部 mkdir/rmdir 后行出现并消失，见 `tests/e2e/knowledge/explorer-keyboard.spec.ts:158`。 |
| A06 | 未实现 / 缺验证 | 已实现并验证 | 根空白菜单创建真实目录；右键、行内、Shift+F10 显示同一受限理由；保留多选；用 isComposing 事件覆盖菜单组字分支。见 `tests/e2e/knowledge/explorer-keyboard.spec.ts:12`、`:85`。 |
| A07 | 未实现 / 缺验证 | 已实现并验证 | 文件与文件夹复制均写入 OperationLog，单文件复制与新 ID 同一步操作提交；非 MD 经树复制、回收、恢复后逐字节比较；越界写请求逐项比较库内外字节。见 `plugins/notes/test/service.test.ts:189`、`:232`、`tests/e2e/knowledge/explorer-keyboard.spec.ts:176`。 |
| A10 | 未实现 / 缺验证 | 已实现并验证 | 目录及 Markdown、TXT 行带受限标记，两类文件只显示元信息；已显式开放 vault.list 的 CLI 仍无法请求受保护内容。见 `tests/e2e/knowledge/explorer-keyboard.spec.ts:85` 与 `apps/engine/test/engine.test.ts:93`。 |
| E03 | 缺验证 | 已验证 | 文件树展开至档案类型定义及记录附件；普通目录只浏览，见 `tests/e2e/workflows/archives-tabs.spec.ts:114`。 |
| E04 | 未实现 / 缺验证 | 已实现并验证 | 两种标签按同一个 index.md 路径改名，外写字段和正文在两视图一致，移除目录后索引和两标签一起裁剪。见 `plugins/notes/test/doc-tabs.test.ts:75`、`tests/e2e/workflows/archives-tabs.spec.ts:177`。原生监听的子树补报及 Linux 重新订阅有回归断言，见 `packages/vault/test/watcher.test.ts:31`、`:74`。 |
| OP-D10 / R6 | 未实现 / 缺验证 | 已实现并验证 | 默认列出 .DS_Store 与 Thumbs.db；指向祖先的链接显示循环原因且拒绝展开；中文、空格、Unicode 与大小写改名保留磁盘字节及元数据。见 `packages/vault/test/list.test.ts:22`、`:79` 和 `plugins/notes/test/service.test.ts:208`。 |
| OP-D11 / R4 | 未实现 / 缺验证 | 已实现并验证 | 类型化偏好位于每 Vault 的 stateDir；旧数组可读，偏好写入或内部改名时写入新格式；外部改名保留旧路径规则。见 `plugins/notes/test/service.test.ts:355` 与 `tests/e2e/knowledge/journey.spec.ts:258`。 |
| F01 | 缺验证 | 已验证 | TXT、JSON 关闭重开后编辑区与磁盘逐行比较，JSON 保留语法标记，见 `tests/e2e/workflows/viewers.spec.ts:66`。 |
| F03 | 缺验证 | 已验证 | PDF 文字层真实拖选得到 Bravo Page；切换后恢复页码、缩放和滚动位置，见 `tests/e2e/workflows/viewers.spec.ts:156`。 |
| F06 / OP-D13 | 未实现 / 缺验证 | 已实现并验证 | 树、标签、@、搜索与详情共用图形表；PDF、Markdown、ZIP、目录及未知类型在实际入口有断言，MDX 角标保留，并检查外部请求。见 `tests/e2e/workflows/viewers.spec.ts:508`、`packages/ui/test/file-icon.test.tsx:44` 及 vendor 角标回归。 |

## WP2 属性、YAML 与大纲

| 复核编号 | 原分类 | 现状态 | 断言与证据 |
|---|---|---|---|
| OP-D17 | 未实现 | 已实现并验证 | Vault 与属性绑定通过同一个纯 YAML 编解码入口读取 zip: 007 为文本，保留多行文本结尾换行，见 `packages/vault/src/semantic/frontmatter-codec.ts` 与 `packages/editor/test/frontmatter-codec.test.ts:45`、`:75`。 |
| C01 | 未实现 | 已实现并验证 | 详情与顶部在同一会话双向编辑同步，阅读模式只读，两处都能显示 BOM 文件属性，见 `tests/e2e/knowledge/editor-s3-properties.spec.ts:128`。 |
| C02 | 缺验证 | 已验证 | SP5 的 13 条固定样本逐项断言；修改相邻标题后日期文本 2026-11 保持，见 `packages/editor/test/sp5-yaml.test.ts:21` 与 `tests/e2e/knowledge/editor-s3-properties.spec.ts:128`。 |
| C03 | 未实现 | 已实现并验证 | BOM、CRLF、BOM+CRLF 三种组合在顶栏及详情改字段后比较整文件字节，再修改正文比较整文件字节，见 `tests/e2e/knowledge/editor-s3-properties.spec.ts:128`。 |
| B10 | 未实现 | 已实现并验证 | 大纲来自解析树，排除 YAML 与围栏伪标题；富文本准确跳到第二个同名标题，源码跳到对应 Setext 标题行，见 `tests/e2e/knowledge/editor-s3-properties.spec.ts:174`。 |
| R8 | 未实现 | 已实现并验证 | OK 顶栏属性、详情和只读属性共享会话和 YAML 编解码入口，见 `packages/editor/src/rich/RichMarkdownEditor.tsx`、`tests/e2e/knowledge/editor-s3-properties.spec.ts:128`。 |

## 改动边界

- WP4 由真实列举传递受限元信息与循环标记，复制接入操作日志，档案记录与 Markdown 标签按真实文件路径重定位及裁剪。
- WP2 将 YAML 编解码收敛到 Vault 的纯模块，详情复用 OK 属性视图，富文本和源码共用解析树大纲定位。
- 为贯通行为，涉及 contracts 的资源类型、编辑器宿主封装、NotesModule 接线、共享查看器、默认宽度的工具栏 CSS、Vault 原生监听及测试、两个 workspace 依赖声明和 lockfile。目录删除与 Linux 子树注册两处由可重复的监听器失败断言定位。

## 验证结果

日志目录为 `/tmp/huhu-w5p4`。

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `pnpm format:check`、`pnpm lint`、`pnpm typecheck` | 0 / 0 / 0 | 最后监听器改动后的三个门禁均通过，见 `final-watcher-*.log`。 |
| `pnpm build` | 0 | 桌面及 CLI 构建通过，OK CSS A/B/C 均为 0，见 `build-final-watcher.log`。 |
| `pnpm knip`、`pnpm notices` | 0 / 0 | 检查通过，两个既有 Knip 配置提示见 `knip.log`。 |
| `node --test scripts/check-ok-class-collisions.test.mjs` 加 `vitest run --maxWorkers=2` | 0 | 启动负载 3.99；CSS 规则 21 通过，86 个测试文件共 1,032 通过，含 7 条监听器用例。最后一处监听器修改另跑该文件共 8 条通过，见 `test.log`、`watcher-final.log`。 |
| `pnpm test:vendor --maxWorkers=2` | 0 | 负载 3.99 重跑，331 个文件、6,427 通过、4 跳过，见 `test-vendor-rerun.log`。首次高负载运行有 3 条 MDX 角标失败和 2 条无关用例超时，角标修复后该文件 16 条通过，两个超时文件单独重跑 167 通过、2 跳过。 |
| `vitest run apps/engine/test/engine.test.ts -t 'vault.list / vault.readRange' --maxWorkers=1 --testTimeout=30000` | 0 | A10 对外权限 1 通过，其余 44 条由筛选跳过，见 `engine-list.log`。另有 96 项定向单测通过，见 `focused-diagnostic.log`。 |
| `node scripts/ok-patches.mjs --check`、以固定 OK_SRC 执行 `--refresh-replay` 与 `--replay` | 0 / 0 / 0 | 294 项登记均匹配，1,350 个文件从固定上游重放，字节零差异。见 `check-patches-final.log`、`check-refresh-final.log`、`check-replay-final.log`。 |
| `HUHU_E2E_HUGE_VAULT=1 xvfb-run -a node_modules/.bin/playwright test tests/e2e/knowledge/{editor-s3-properties,explorer-keyboard,huge-vault,journey}.spec.ts tests/e2e/workflows/{archives-tabs,viewers}.spec.ts --grep 'A0[1-7]|A10|10 万文件|用户完整路径|E03|E04|F01|F03|F06|S3：属性|S3：坏 YAML|C01–C03|C04|B10' --workers=1 --retries=0` | 首轮 126 | 22 通过、3 失败。仅重跑失败 spec 的对应测试，重启用例通过见 `e2e-retry.log`，F06 通过见 `e2e-final2.log`，E04 最终 1 通过且退出 0 见 `e04-verified.log`。25 项均有通过记录。 |

- 高负载定向单测曾在用例、清理钩子及 worker RPC 超时。CLI 自动启动用例在负载 3.99 时重跑通过，见 `cli-rerun.log`。
- 有两次 Electron 启动与另一个批次相撞，收到其他进程后中止自己的批次。后来将检测扩大到 Playwright CLI 与 xvfb-run 进程，等待其退出再复验。中止批次未计入通过结果。
- E04 相关重复失败包括文件树切回后目录未展开、原生目录删除漏报、Linux 初次收到新增子树时漏订阅后代。额外的事件观测定位到 Engine 没有发出对应的外部事件。两个监听器回归分别先失败再通过。F06 复验修复了窄窗口图标和目录夹具，重启用例修复了关闭 Electron 后取进程对象的清理逻辑。

## 待用户决定

无。

## 未完成项

无。代码已提交到本地分支，工作树干净。

- 2026-11-20 Lead：接受，待集成后复验。WP4 / WP2 各子项均给出断言位置；e2e 首轮 3 失败，修复后仅重跑失败项通过，如实记录。高负载下的单测超时已在较低负载重跑。集成候选上由 Lead 统一跑全量。
