# 合并工作包 WP5 + WP6 执行回报

任务身份为 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`、`w5:p5`、`task01.md`。工作树为 `/home/wta/projects/huhu-wt-w5`，分支为 `closeout4/wp5`。工作包合并提交为 `9efe978`，实现与记录提交为 `5f6460d`、`0b76d98`、`65b2f6d`、`e14b462`。工作树干净，未推送。

跨模式撤销、紧凑编辑器、外链预览、离线表情、相对路径图片、样式隔离和来源重放已交付。定向 Electron 的 19 个用例累计全部通过。整包状态为 `blocked`，待解决项目见报告末尾。

## WP5 编辑行为、宿主适配与外链预览

下表中的产品源码和测试路径相对工作树根目录。Electron 结果见验证记录。

| 复核编号 | 原分类 | 现状态 | 断言与证据 |
| --- | --- | --- | --- |
| B01 构造矩阵与 36 项斜杠 | 缺验证 | 部分 | `tests/e2e/knowledge/editor-s3-matrix.spec.ts:83` 对 13 个样本检查节点、链接目的地、实际图片解码和无编辑字节。:247 从独立文档逐个执行 36 项并检查节点属性、上传字节或表情，36 项全部通过。旧矩阵所有既有勾选、82 行逐能力关联仍待复核，不能用构造测试替代理解和操作。 |
| B02 三阶段语义 | 缺验证 | 已验证 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:619` 将同一文档用于编辑、阅读和保存重开，复用语义断言。真实失败显示存在的相对图片被笔记索引判为缺失。已让桌面沿用既有 Vault 媒体协议判定，并加入解码断言。三阶段均通过。 |
| B03 斜杠菜单边界 | 缺验证 | 部分 | `tests/e2e/knowledge/editor-s3-menus.spec.ts:157` 通过合法前缀、越过首尾循环、滚动重定位、切文档与焦点清理。右边缘和与固定 OK 的同场对跑仍欠证。 |
| B04 Electron CDP IME | 缺验证 | 部分 | `tests/e2e/knowledge/editor-s3-menus.spec.ts:204` 通过全角与半角 Slash、预编辑 Enter、代码／URL 例外和表格过滤。一般组合与取消在 `tests/e2e/knowledge/editor-s3-parity.spec.ts:152` 通过。撤销及粘贴后继续 IME 尚未专项覆盖。 |
| B05 单一历史与外部回写 | 未实现／缺验证 | 已验证 | `tests/e2e/knowledge/editor-s3-menus.spec.ts:70,119` 通过模式交错撤销与重做、一次撤销 H2、实际文件监视更新不增栈。实际 provider 的同一片段交错替换回归先红后绿，外部内容不入栈见 `packages/editor/test/golden-roundtrip.test.ts:218,242`。compact 未缓存 editor 销毁后重挂的历史见 `packages/editor/test/document-history.test.ts:6`。 |
| B06 选区、跨行及拖选 | 缺验证 | 已验证 | `tests/e2e/knowledge/editor-s3-parity.spec.ts:64,232` 两例均通过。覆盖反向选择、边缘滚动、表格进出、折行横坐标和替换文本保存。 |
| B07 键盘、鼠标与原生剪贴板 | 缺验证 | 部分 | `tests/e2e/knowledge/editor-s3-parity.spec.ts:391` 键盘列表缩进／回车／退格、代码块退出、表格和正文鼠标拖放已通过。`tests/e2e/knowledge/editor-parity-closeout.spec.ts:704` 通过系统键盘快捷键访问剪贴板，核 Markdown、实际粘贴格式及落盘，补证通过。键盘只验证了退出代码块，进入和列表退格合并仍欠专项覆盖。 |
| B08 四个事件的实例及 IME 连续性 | 缺验证 | 已验证 | `tests/e2e/knowledge/editor-s3-parity.spec.ts:318` 对照 DOM、Editor 引用、焦点、选区、组合态、提交后的落盘。首轮复测实际走过自动保存和后台评论刷新，对另一个进程写入尚未保存的笔记时，外部 YAML 未在正在编辑的 UI 中显示。通过的最终用例使用属性控件自己的变更处理器，以及新笔记引起的列表刷新。 |
| OP-D04 本地 fetch 与作用域 | 未实现 | 已验证 | `packages/editor/test/host-fetch-scope.test.ts:6` 断言挂载与卸载前后全局 fetch 身份、未注册请求及路由恢复。现有 Frimousse 直接发起同源请求，数据由构建作为静态资源提供，保留中文及英文搜索别名。H04 覆盖差距见下表。 |
| OP-D18 compact | 未实现／缺验证 | 已验证 | `tests/e2e/knowledge/editor-compact-commands.spec.ts:6` 核文本命令、过滤上传／嵌入／脚注、实际 @ 选取、原生文本选择、无批注按钮／编辑框、保存引用。收件想法输入由原复核分派其他工作包。 |
| Q3 外链预览 | 未实现 | 已验证 | `tests/e2e/knowledge/editor-link-preview.spec.ts:7` 核默认关闭、开启调用、失败保留 URL。复用固定 OK 的 DNS / 公网地址检查、重定向边界与 HTML 元数据提取，总时间 5 秒、正文上限 512 KiB，设置路径与请求边界由单测覆盖。 |
| H01 黄金样本 | 缺验证 | 部分，需决定 | `packages/editor/test/golden-roundtrip.test.ts:186` 实际处理 122 样本。103 项逐字节一致，18 项以登记的双 SHA、差异原因和生产等价谓词验证，1 项 BOM＋CRLF 的谓词失败，保留原始磁盘字节与输入输出证据。 |

## WP6 样式、上游来源与隔离

档案证据目录为 `.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/`。

| 复核编号 | 原分类 | 现状态 | 断言与证据 |
| --- | --- | --- | --- |
| OP-D05 CSS 分层、颜色、优先级 | 未实现／缺验证 | 已验证 | `scripts/ok-css-build.mjs:20` 将 OK 基础和组件限定为 `vendor.ok-base`、`vendor.ok-components`，移除上游整套调色表及默认文件树蓝色，没有为此新增 `!important`。`packages/ui/src/styles/components/core.css:123,1386` 把冲突的宿主字号和标题规则限定在 OK 边界之外。构建 A/B/C 均零。 `tests/e2e/knowledge/theme-ok-tokens.spec.ts:144` 在真实 Electron 通过加载前后根变量及编辑器、挂在 body 上的 portal、宿主三个位置的控件和标题字号断言。 |
| OP-D15 宿主门禁 | 未实现 | 已验证 | `packages/editor/build/check-host-types.mjs`、`packages/editor/package.json:19`、`knip.json` 与 `oxlint.json` 对宿主走独立 strict 程序和规则，纳入 ORCA PDF lint。 |
| OP-D16 vendor CI | 未实现／缺验证 | CI 接线完成，适用覆盖见 G04 | `.github/workflows/ci.yml:52` 独立 vendor job 与固定来源清单检查。 |
| G01 文件级来源清单 | 未实现 | 已验证 | `source-file-catalog.md` 和压缩清单对固定 OK 7,621、ORCA 39,025 文件逐项列目标、处置、原因，脚本重放时校验集合。 |
| G02 ORCA 重放及切片增量 | 未实现／缺验证 | 已验证 | `scripts/ok-patches.mjs`、`orca-replay.json` 与差异包重放 ORCA 12 文件、OK 1,354 文件，集合和字节一致。`slice-patch-delta.md` 留存各切片的可重算计数。 |
| G03 ledger 追溯 | 缺验证 | 已验证 | `docs/upstream/ledger.md:24,33`、`THIRD_PARTY_NOTICES.md:135,144` 指向当前统一清单，修复旧归档链接，新增 R-54。 |
| G04 上游与收集差集 | 缺验证 | 部分 | `vendor-test-catalog.md`、`vendor-test-files.jsonl.gz`、`vendor-test-results.md` 记录全集、实际收集和四个跳过。OK 仍有 1,065 个未审文件，ORCA 仍有 4 个，适用分母和 70% 要求尚未证明。 |
| H04 打包调用覆盖 | 缺验证 | 部分 | `packages/editor/build/check-host-endpoints.mjs` 从桌面产物提取路径及成员并断言覆盖，报告在 `desktop-host-endpoints.json`。 `/api/asset` 仍有页面图标等消费者，`shell.openExternal` 尚无桌面 provider。 |
| H04 handler 与 UI | 缺验证 | 部分 | `packages/editor/test/core-routes.test.ts` 校验核心路由与跨 Vault 迟到回执，`packages/editor/test/host-feedback.test.tsx:27` 在真实标签弹层验证匹配结果和错误反馈，Upload、Files 与 Comments 单测覆盖另外几条路径。仍欠每个 handler 的正常、错误码及 UI 反馈闭环。 |
| R12 历史产品条款 | 未实现 | 已完成 | 工作台原定义的 `product.md:66` 和 `reuse.md:62,63` 更新后继引用，记录知识库范围内的替代关系。 |
| Q6 冻结来源的 S0 差异 | 缺验证 | 证据限制已登记 | `s0-facts.md:24` 两个本地冻结引用均为 0 / 0，相关目录无差异。历史远端 ref 无法从现存材料恢复。 |
| F05 下载、凭据、scheme 标志 | 缺验证／未实现 | 下载／凭据已验证，三位待决定 | `tests/e2e/workflows/viewers.spec.ts:334,378,482` 三例均通过，main 观察下载取消并检查凭据边界。桌面 main 单测锁定当前三位白名单，逐位撤除影响未验证。 |
| OP-D08 外链与 (b) 对跑 | 未实现／缺验证 | 待决定 | 目前离开预览来源和新窗口都会被拒绝，现有桌面分支没有可供转交的外链 provider。选 (b) 的独立对跑从未执行。 |
| OP-D09 ORCA 外壳及查找 | 未实现 | 待决定 | PDF 已复用核心和本地资源。当前 Huhu 工具栏按钮与 ORCA 按活跃窗格分派的查找快捷键具有行为差异，见下节。 |

## 验证记录

- 各 Electron 批次启动前检查 `pgrep -af 'electron|playwright'`，等待其他任务退出。命令均为 `xvfb-run -a node_modules/.bin/playwright test <下列 spec> --grep <下列范围> --workers=1 --retries=0 --output <对应结果目录>`。首次统一运行的范围为 `B0[2-8]|OP-D18|Q3|矩阵|OP-D05|F05`。spec 为 `tests/e2e/knowledge/{editor-compact-commands,editor-link-preview,editor-parity-closeout,editor-s3-matrix,editor-s3-menus,editor-s3-parity,theme-ok-tokens}.spec.ts` 和 `tests/e2e/workflows/viewers.spec.ts`。19 项中 9 通过、10 失败，进程包装器返回 126。日志 `/tmp/huhu-merge-e2e.log`，结果 `/tmp/huhu-merge-e2e-results`。
- 只复跑首次失败的 10 项。范围为上表两项矩阵、OP-D18、Q3、B02、B05 一次撤销、B07 原生剪贴板和键盘拖放、B08、OP-D05。3 项通过、7 项失败，进程包装器返回 126。Q3、B05 一次撤销和 B07 键盘拖放通过。其余失败来自实际相对图片未加载、表情数据未返回、过严的剪贴板换行等断言，以及同时编辑时外部 YAML 写入的路径选择。日志 `/tmp/huhu-merge-e2e-retry.log`，结果 `/tmp/huhu-merge-e2e-retry-results`。
- 第二轮定向复跑只选上述 7 个失败项。spec 为 `tests/e2e/knowledge/{editor-compact-commands,editor-parity-closeout,editor-s3-matrix,editor-s3-parity,theme-ok-tokens}.spec.ts`，grep 为 `OP-D18|B02 同一|B07 原生键盘|矩阵·|B08 保存|OP-D05：`。6 通过、OP-D05 失败，包装器返回 126。与此前两轮合计 18 个不同用例通过。详情见 `/tmp/huhu-merge-e2e-final.log`、`/tmp/huhu-merge-e2e-final-results`。
- 修复共享宿主字体规则后，只对 `tests/e2e/knowledge/theme-ok-tokens.spec.ts` 运行 `--grep 'OP-D05：' --workers=1 --retries=0`，1 通过、退出 0。四轮累计 19 个不同用例均通过。最后修正只改 CSS 及构建期依赖解析，依纪律保留此前绿色结果。日志 `/tmp/huhu-merge-e2e-css.log`。本包未运行全量 Electron 或性能测量。
- `pnpm --config.verify-deps-before-run=false test --maxWorkers=2` 的 CSS 脚本单测 22 通过。Vitest 共 987 通过、33 失败、1 跳过，4 个未处理错误。失败见 `/tmp/huhu-merge-test.log`，包括超时、writer.lock 的 ENOENT，以及 engine、notes、herdr、automation 等用例失败。首轮结果保留为失败。复跑只选这 10 个失败文件，以根 `node_modules/.bin/vitest run --maxWorkers=1` 启动。一分钟负载 2.94 时启动，10 文件、190 个测试全部通过，退出 0，未再报未处理错误。日志首行记录负载，第二行保留完整文件列表，见 `/tmp/huhu-merge-root-low.log`。
- `pnpm --config.verify-deps-before-run=false test:vendor --maxWorkers=2` 的收集记录为 331 文件、6,427 通过、4 跳过，退出 0，日志 `/tmp/huhu-merge-vendor-final.log`。前一轮 4 个失败，修复源码／Slash 回归后定向 27 通过，随后全量通过；最后图片修正后只跑 `test:vendor --maxWorkers=1 image-target-existence.test.ts ImageReferenceView.dom.test.tsx ImageInlineZoomView.dom.test.tsx`，24 通过、退出 0。
- 以根 `node_modules/.bin/vitest run --maxWorkers=2` 对黄金样本、文档历史、局部 fetch、核心路由、宿主错误反馈、外链预览及 preview session 共 7 个文件定向运行，142 通过、退出 0（`/tmp/huhu-merge-targeted-final2.log`）。交错替换回归的红绿日志为 `/tmp/huhu-merge-overlap.log`、`/tmp/huhu-merge-history-ssr-unit.log`。
- `pnpm --config.verify-deps-before-run=false build` 退出 0，随构建执行的 `check:ok-css` 的 A、B、C 均 0（`/tmp/huhu-merge-build-final5.log`），新增边界回归在 `node --test scripts/check-ok-class-collisions.test.mjs` 随同 22 项已存断言一起通过（23 通过、退出 0）。`pnpm --config.verify-deps-before-run=false --filter @huhu/editor build:harness` 退出 0。两个产物均含离线表情的中英文 data / messages JSON。
- 设置 `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge`、`ORCA_SRC=/home/wta/projects/huhu/temp/sources/orca` 后运行 `node scripts/ok-patches.mjs` 的 `--refresh-replay`、`--refresh-catalog`、`--check`、`--replay`、`--replay --orca`、`--check-catalog`，均退出 0。OK 登记 326，未登记与多余登记均 0。逐个检查 ledger 与 notices 中指向来源清单的 4 个路径。
- `node packages/editor/build/check-host-endpoints.mjs --assert` 检出 44 个签名及上述 2 个缺口，已生成候选产物对应的宿主清单。脚本根据缺口设退出码 1，本机进程包装器返回 126。相关日志 `/tmp/huhu-merge-endpoints-final5.log`。

- `pnpm --config.verify-deps-before-run=false` 分别执行 `typecheck`、`format:check`、`lint`、`knip`、`notices`，最终均退出 0。Knip 曾将动态解析数据包误报为未使用，改用显式固定解析路径后通过。工作树 `git diff --check` 通过。

## 待用户决定

- **H01 BOM 样本**。固定 OK 的 `stripFrontmatter` 要求开头就是 YAML 围栏。带 BOM 的黄金样本保留原始源缓冲，但原样进入 OK hydrate→serialize 时，起始围栏变为 `***`，生产 `isParseEquivalentBridge` 拒绝等价。可在 Huhu 文件输入处独立保留 BOM 并传无 BOM 的 YAML 给桥，增加变更后 BOM／CRLF 的落盘验收。另一种方案是保留固定 OK 的渲染并接受这一条文件级差异，需要显式批准规格例外。目前测试固定了输入／输出哈希和等价拒绝结果。
- **F05 scheme 标志**。当前注册明确为 `standard`、`secure`、`corsEnabled`。可保留三位并批准当前安全约束，或逐位撤除，重验相对资源、CSP、Engine 凭据与下载。当前已锁定白名单，尚无逐位去除的行为证据。
- **OP-D08 预览外链与候选对跑**。桌面现行策略拒绝新窗口，预览框架离开协议也会被阻止。源码没有可供转交的桌面外链 provider。可新增由宿主确认的 HTTP(S) 外部打开入口并保留脚本导航拒绝，或批准继续阻止链接离开。候选 (b) 可补独立对跑，或批准以现有 (a) 的隔离证据作为选型依据。
- **OP-D09 PDF 外壳与键盘所有权**。固定 ORCA 的 `use-pdf-viewer-find-shortcut.ts` 使用共享 `editor.find` 绑定，并要求当前分栏拥有命令。Huhu 的 `PdfView.tsx` 当前通过按钮开启查找，改写了 PdfViewer／PdfFind 外壳。可授权保留 Huhu 外壳并补焦点区与查找快捷键验收，也可按指定复制范围引入 ORCA 外壳与最小键盘路由，重验查找、焦点和重载。

## 未完成项与交接

- H01 的 BOM 样本规格冲突、F05 三个 scheme 标志、OP-D08 的外链策略和备选设计、OP-D09 的复制边界，均需规格负责人确认。
- G04 仍需逐条审查未分类上游测试，OP-D16 的适用普通测试覆盖也依赖这张分母表。H04 仍有两个打包调用缺口，表驱动反馈验证未覆盖全部 handler。
- B01 旧矩阵逐能力链接、B03 固定 OK 的边界对跑与菜单右缘、B04 撤销及粘贴后的输入法回归、B07 代码块键盘进入及列表退格合并的专项证据尚待补齐。
- 合并保留 WP5、WP6 源码和 provenance。涉及共享工作台路径的最小接线见 `apps/desktop/electron.vite.config.ts`（复用现有构建入口放置离线数据）、`packages/editor/vite.harness.config.ts`（浏览器验证资源接线）、`packages/ui/src/styles/components/core.css`（限制普通宿主控件和标题的字体规则），以及 `scripts/check-ok-class-collisions.mjs` 的边界回归。此处构建与样式决策为本包实现选择。

### Modern Web Guidance

- `ime-safe-enter-submit` 的 “`event.isComposing || event.keyCode === 229`” 用于保护斜杠菜单的键盘提交。
- `css` 的 “use `:where()` to make selectors only compete based on meaningful signals” 用于限制宿主控件的字号规则，保留 OK 的局部层叠和宿主选择器优先级。
