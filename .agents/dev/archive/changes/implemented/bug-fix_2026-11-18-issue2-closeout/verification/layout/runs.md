# 运行记录

## 构建与通用门禁

| 命令 | 退出码 | 观察 |
| --- | ---: | --- |
| `git worktree add --detach /home/wta/projects/huhu-wt-rc4 v0.0.1-rc.4` | 0 | rc.4 对照工作树指向 9132640 |
| `pnpm --dir /home/wta/projects/huhu-wt-rc4 install --frozen-lockfile` | 0 | 对照依赖安装完成 |
| `pnpm --dir /home/wta/projects/huhu-wt-rc4 build` | 0 | 对照桌面 out 构建完成 |
| `pnpm build` | 0 | 基线 9f870c0 与候选 585b997、34e7547 均构建完成 |
| `pnpm typecheck` | 0 | workspace 类型检查通过 |
| `pnpm lint`（初次） | 126 | Playwright 空对象绑定被 oxlint 拦截，随后改用 `test.info()` |
| `pnpm lint`（第二次） | 126 | CSS 入口缺少显式 layer，随后把 token 别名与覆盖层分开导入 |
| `pnpm test` | 0 | 81 文件通过、1 文件跳过，852 用例通过、1 用例跳过 |
| `pnpm test:vendor` | 126 | 167 文件，4173 用例通过、2 跳过。Vitest 另报 worker RPC `onTaskUpdate` 超时 |
| `pnpm test:vendor --maxWorkers=2` | 143 | 输出完整确认 167 文件、4173 用例通过、2 跳过，外层执行会话以 SIGTERM 结束 |
| `pnpm --filter @huhu/editor test:vendor --maxWorkers=2 src/vendor/open-knowledge/core/src/y-prosemirror-patch.test.ts` | 0、143、0 | 受慢依赖树检查影响的单测分别复跑，每次均输出 10 条通过。第二个外层进程结束码 143 |
| `node scripts/ok-patches.mjs --check` | 0 | 25 个变更、5 个测试变更、4 个删除、22 个新增。未登记或多余登记均为 0 |
| `pnpm format:check`、`pnpm knip` | 0 | 格式、未使用项检查通过 |

## 桌面端验证

所有 Xvfb 矩阵使用 `-s '-screen 0 2200x1300x24'`。下表省略重复的 `--output` 路径参数。

| 命令或选择器 | 退出码 | 观察 |
| --- | ---: | --- |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-toolbar.spec.ts -g '1280px 下详情'`（9f870c0） | 1 | 1 个用例复现七处中心点被遮挡。日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/f07-before.txt`） |
| 同一命令（首次实现） | 0 | 1 个用例通过 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-toolbar.spec.ts`（迭代） | 1 | 发现窗口最小尺寸、树行焦点、详情标签初始化和 CSS 宽度取整需要在驱动中处理 |
| 同一测试以 `-g 1439px --repeat-each=3` 重跑 | 0 | 3 次通过。日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/f07-1439-retry.txt`） |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/a11y.spec.ts` | 1 | 43 通过、1 跳过、3 失败。详见 首次全量日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/e2e-first.txt`）。四条 a11y 均通过。失败为残留缩放影响宿主路由用例、H03 英文残留、F08 发现文件树 Shadow DOM 尚有非主题颜色 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-toolbar.spec.ts tests/e2e/knowledge/host-routes.spec.ts -g 'F07：\|宿主路由'`（585b997） | 0 | 修正测试退出时的缩放清理后 8 条通过。日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/f07-with-host-routes.txt`） |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/i18n-zh-hans.spec.ts` | 1 | 运行扫描。28 个白名单外的英文界面标签在现有范围内无法接入翻译，见 [H03](h03-i18n.md) |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/theme-ok-tokens.spec.ts --reporter=json`（迭代） | 1 | 核对 CSS 变量、Shadow DOM、固定选中前景及 Options 图标，逐项补充作用域覆盖 |

首次全量运行使用 `NODE_OPTIONS=--require=/tmp/huhu-layout-e2e-archive.cjs`，把现有矩阵用例对归档 `matrix-run.json` 的写入重定向到 `/tmp/huhu-layout-suite-matrix-run.json`。归档跟踪文件的前后 Git blob 均为 `7295ee6d125ac0eb15a4908dd6102790dccb84b8`。

## 工具与性能

- `pnpx modern-web-guidance@latest search` 调用分别覆盖响应式工具栏、容器布局、主题属性及异步加载，均退出 0。两次 `retrieve` 读取了 `toolbar`、`css-layout`、`responsive-design`、`single-line-overflow`、`conditional-async-dependencies`、`performance`、`design-token-reactivity`、`css`、`dark-mode`、`browser-ui-theming`、`size-aware-styling`。一次额外探查误用 `pnpm` 执行，退出 126。
- Web 样式探针使用 Playwright Chromium 和当前源文件，8 个主题组合与容器查询均通过，退出 0。
- 用 `xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4` 执行对照。早期资源探针未捕获 Electron 自定义协议下的脚本。改为 CDP 的 `Debugger.scriptParsed` 后，单样本模块诊断通过。首轮 20 对样本全部产出并打印统计，外层执行会话在统计打印后退出 143。
- 同参数 `tar -czf` 对两份 `apps/desktop/out` 压缩，退出 0。rc.4 的 `electron-builder --linux deb --x64` 在未出包的情况下停止，退出 143。[G07](g07-budget.md)

## 收尾复验

| 命令 | 退出码 | 观察 |
| --- | ---: | --- |
| `pnpm build`（8168981） | 143、143、0 | 前两次打印构建完成后外层会话结束，独立复跑退出 0。最终构建 SHA 为 8168981 |
| `pnpm lint`、`pnpm format:check`（8168981） | 0 / 0 | CSS 层、类名、所有权、重名守护和格式通过 |
| `pnpm knip`、`node scripts/ok-patches.mjs --check`（34e7547） | 0 / 0 | 复验通过 |
| `pnpm test:vendor --maxWorkers=2`（最终复验） | 0 | 167 文件通过。4173 用例通过，2 跳过 |
| 单独重跑依赖树检测（第 4 次） | 0 | 10 条通过，累计 3 次正常退出 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-toolbar.spec.ts tests/e2e/knowledge/host-routes.spec.ts -g 'F07：\|宿主路由'`（34e7547） | 0 | 8 条通过。含 96 组合的完整矩阵 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-toolbar.spec.ts -g 'F07：800px'`（8168981） | 0 | 800 px 的 16 组合复验 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/host-routes.spec.ts --repeat-each=3`（8168981） | 0 | 3/3 通过。日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/host-routes-retry.txt`） |
| `xvfb-run -a pnpm e2e tests/e2e/a11y.spec.ts`（8168981） | 0 | 4/4 通过。日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/a11y-final.txt`） |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/theme-ok-tokens.spec.ts --reporter=json`（34e7547 / 19a0ef0 测试） | 0 | 1 条通过，8 主题模式、24 屏、未知稳定色 0 |
| `xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 20`（34e7547） | 143 | 第二轮共 40 个成功样本。统计完成后外层会话退出 |
| `xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 1 --trace-modules`（8168981） | 0 | 2 个成功样本。最终候选模块惰性加载通过 |
| `xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '冷启动到工作台可交互'`（8168981） | 0 | 1/1 通过，冷启动 2313 ms，插件停用 / 启用 46 / 66 ms，Engine RSS 170 MiB |
| 同一冷启动用例，`pnpm --dir /home/wta/projects/huhu-wt-rc4 e2e …` | 1 | 1/1 未通过，7259 ms 含首次 Electron 二进制安装 |
| 同一 rc.4 冷启动用例，`--repeat-each=3` | 126 | 3/3 未通过。3692、3612、4155 ms 均超该用例的 3000 ms 阈值。正式相对对照使用两轮交替样本 |

### Modern Web Guidance

- **`size-aware-styling`**：我用文档容器尺寸控制编辑模式收纳。打开详情栏或改变浏览器缩放时，收纳依据工具栏实际可用空间（“Apply styles based on container size”）。
- **`toolbar`**：我复用了尾部“笔记操作”，把窄栏隐藏的撤销、重做和导出放到菜单中（“Add a trailing ‘More actions’ menu”）。
- **`css`**：我将 OK 映射放进已有层序，并利用重要声明反转的层优先级覆盖文件树的 vendor 选中颜色（“Use cascade layers … to define explicit priority zones”）。

## task02 验证

交付业务构建为 `94e79ea`。全量桌面 E2E 和启动对照均使用该构建。启动对照统一绑定 CPU 0–3。全量 E2E 绑定 CPU 4–7 以减少彼此影响，Xvfb 设 2200 × 1300 以容纳宽屏布局矩阵。通过 Node 预加载拦截矩阵测试对历史归档 `matrix-run.json` 的唯一写入，转存至临时目录，保留了正式归档。

| 命令 | 构建与结果 |
| --- | --- |
| `pnpm typecheck` | 交付业务构建和收件箱探针退出 0。此前外层退出 143 的执行已完整重跑。 |
| `pnpm lint` | 交付业务构建和收件箱探针退出 0。 |
| `pnpm knip` | 交付业务构建和收件箱探针退出 0。 |
| `pnpm test` | 交付构建退出 0。81 个测试文件、852 个测试通过。1 文件、1 测试跳过。 |
| `pnpm test:vendor` | 交付构建的独立复跑退出 0。167 个文件、4173 个测试通过，2 个跳过。与单元并跑时全部断言通过，但 Vitest worker 的 `onTaskUpdate` RPC 超时使第一次运行失败。 |
| `node scripts/ok-patches.mjs --check` | `94e79ea` 退出 0。29 个修改、5 个补测、4 个删除、22 个新增匹配 60 条登记。 |
| `pnpm build` | `94e79ea` 退出 0。 |
| `pnpm format:check` | 交付业务构建和收件箱探针均通过，退出 0。 |
| `xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 1 --trace-modules` | `94e79ea` 退出 0。候选工作台和收件箱无编辑器命名 JS 块，首篇笔记载入 `rich-*`。 |

交付前的整体路由试验出现附件及重开文档失败。缩小拆分范围后两个用例各复跑三次，均通过。试验 E2E（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-e2e-routing-pilot.txt`） · 定向复跑（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-attachment-document-retry.txt`）

交付构建工具链输出（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-tooling.txt`）

### 全量 E2E 与失败用例复跑

- `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/a11y.spec.ts tests/e2e/perf.spec.ts` 的 Playwright 退出 1，外层随后退出 143。48 通过、4 失败、1 跳过。跳过项为默认关闭的 10 万文件压力用例。工作台冷启动 1638 ms、插件停用 / 启用 59 / 99 ms、Engine 171 MiB，均过阈值。H03、F08、附件、用户全路径和 200 轮泄漏用例都通过。全量日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-e2e-final.txt`）
- D01/D02 全量时按 Esc 后批注输入仍可见，单独选出后复跑 3/3 通过。S2c 同一组初次复跑 1/3 通过，一次只数到 29 个 ProseMirror，另一次提交后未显示预期文本。降低宿主负载后 S2c 再跑 3/3 通过。task01 同一用例通过 3/3。第一组复跑（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-e2e-retries.txt`） · 较低负载复跑（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-e2e-idle.txt`） · task01 紧凑评论（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-compact-baseline.txt`）
- 1 MiB 打开阈值 500 ms。全量为 511 ms，初次复跑 262、337、566 ms（2/3）；较低负载复跑 165、160、415 ms（3/3）。第一组复跑（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-perf-retries.txt`） · 较低负载复跑（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-e2e-idle.txt`）
- 5,000 行实时预览输入 p95 阈值 16 ms。全量为 22.7 ms，单独选出后的三次为 18.7、17.0、22.3 ms（0/3）。task01 构建以同一用例复跑为 58.0、50.0、22.3 ms（0/3），其 1 MiB 打开复跑则为 366、355、472 ms（3/3）。两组复跑时段的负载不同，说明已有绝对阈值超限，无法据此估计精确版本差。较低负载复跑（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-e2e-idle.txt`） · task01 性能用例（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task02-perf-baseline.txt`）

### Modern Web Guidance

检索了 `split lazy javascript modules` 和 `localize accessible button labels`。读取 `conditional-async-dependencies`、`performance` 和 `accessibility`。将“DO use dynamic imports”用于非 Markdown 查看器边界。应用“Do include a control’s visible text in its accessible name”，气泡菜单用同一消息生成鼠标提示和读屏名称。

## task03 复验

重启后现场为集成合并 `e473f76`，保留了合并后尚未暂存的实现。旧 `test-results` 仅用于回溯，重启前的 build、类型检查和 rc.4 打包均重跑。通过 `pnpm install --frozen-lockfile` 对齐集成锁文件。完整 Electron 运行使用生产配置，Xvfb 为 2200 × 1300。因早期打包仍在读取默认 out，从临时目录启动相同生产配置构建的 `b8bafc9`。E2E 矩阵对历史 `matrix-run.json` 的唯一写入重定向到 /tmp。

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` | 业务构建均退出 0。 |
| `pnpm build` | 重启后重跑成功，默认 out 和独立暂存均用相同生产构建配置，完成文件标记 `b8bafc9`。 |
| `node scripts/ok-patches.mjs --check` | 217 条登记，未登记 0，多余登记 0。 |
| `pnpm notices` | 退出 0，列出 1,400 项。生成文件新增集成分支引入的测试辅助依赖 `@testing-library/user-event`，保留生成差异用于核对，清除业务提交中的生成副作用。 |
| `pnpm test` | 初次并发时 Engine 的 3 项测试超时。单独重跑 3 轮，每个用例均通过。第二次全量 987 通过、1 跳过，退出 0。 |
| `pnpm test:vendor` | 首次 6,008 通过，R13 依赖树扫描超时，另有 Vitest RPC 超时。R13 单独复跑三次均通过。第二次全量 290 文件，6,009 通过、4 跳过，退出 0。 |
| H03 和 B01 定向 Electron | 4/4 通过。中文表面和逐命令扫描白名单外均为零。 |

### Modern Web Guidance

- **`menu`**：复用了现有菜单容器，并在键盘触发时聚焦第一项，Esc 后返回标签（“Closes it and restores focus to its trigger”）。
- **`viewport-aware-dropdowns`**：原生 Popover 让菜单独立于标签条滚动区域。位置按窗口与菜单实际尺寸限制。鼠标触发使用指针，键盘触发使用标签位置。
- **`forms`**：语言使用原生单选下拉，显示标签通过 `for` 和 `id` 关联，选项声明各自的内容语言。

### 全量端到端结果

`xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/a11y.spec.ts` 的 Playwright 结果为 80 通过、6 失败、1 默认跳过。a11y 的 4 个场景、H03 的 3 个场景、B01 标签菜单、F07 全部宽度和 F10 的 200 轮均通过。全量日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task03-e2e-full.txt`）

- 4 项稳定定位失败。复刻测试的 Embed 仍找英文菜单项，气泡仍找 `underline`，Callout 仍找 `Callout properties` / `Callout 属性`，而文件树用例仍找 `Options`。这些用例归其他工作项维护，实际显示分别为“嵌入”“下划线”“提示框属性”“文件操作选项”。
- 完整旅程首次在 TXT 查看器等待 `.cm-content` 超时。独立复跑三次通过两次，另一回切回笔记继续输入后，磁盘断言缺少尾字。两种失败的共同原因尚未定位。旅程复跑（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task03-journey-retries.txt`）
- F08 主题矩阵原先依赖从设置返回知识库时详情栏重置。H03 语言切换要求保留现有详情栏，测试改为显式打开详情和选择属性页，独立复跑 3/3 通过。F08 复跑日志（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task03-f08-retries.txt`）

最终 ASAR 路径与内容断言通过，解包应用冒烟验证 4/4 通过。G07 的同格式 Debian 体积对照完成。30 分钟负载监测未达到开跑阈值，启动样本未生成。[ASAR 证据](asar-contents.md) · [G07 证据](g07-budget.md)

## task04 HTML 代码块预览

`zh-modern-web-guidance` 检索词为 `isolate sandboxed iframe content`，读取 `security`、`validate-origins`。按 “Always validate the `event.origin` of incoming messages” 校验父窗口来源和窗口引用，再校验正文类型。子框架使用不透明来源，发送端按实际 iframe 的 `contentWindow` 投递，桌面主进程限制该框架的导航和请求。根据 “verify `event.source === expectedWidgetWindow`”，上游编辑器接收预览高度和 CSP 事件时沿用其对具体 iframe 窗口的核对。

生产基线确认缺失内页，首轮修复运行在加载富编辑器时耗尽 5 秒断言时限。另一轮已跑通手写预览的网络与权限断言，工具栏按钮改用键盘操作后通过编辑入口。180 秒整条时限的轨迹显示前四种模板已成功编辑、保存、重开，第五种模板已渲染。最终用例给予整条六场景流程 300 秒，在单项中保留 12 秒 DOM 断言时限。

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 退出 0。首次发现主进程的 Vite 原始资源导入缺少类型声明，补齐引用后全量复跑通过。 |
| `pnpm lint`、`pnpm format:check`、`pnpm knip` | 均退出 0。Knip 报告编辑器已有的两条 ignoreDependencies 配置提示。 |
| `pnpm test:vendor` | 单次执行 290 文件、6,009 通过、4 跳过，退出 0。以 `VITEST_MAX_FORKS=2`、`VITEST_MAX_THREADS=2` 控制本机并发。 |
| `node scripts/ok-patches.mjs --check` | 220 条登记，未登记 0，多余登记 0。 |
| `pnpm build` | 退出 0。主进程内联内页，同时生成浏览器资源 `preview-frame-BkDyy7do.html`。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/preview-*.spec.ts tests/e2e/workflows/viewers.spec.ts` | 9/10 通过。新用例和两项 F05 通过，F04 在切回预览后单次获取子框架时提前退出。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/preview-*.spec.ts --repeat-each=5` | 5/5 通过，每轮本地监听器收到 0 个请求。8 个逻辑核，1 分钟负载采样范围 27.54–62.54。 |
| `xvfb-run -a pnpm e2e tests/e2e/workflows/viewers.spec.ts --grep 'F04\|F05' --repeat-each=3` | 两项 F05 均 3/3。F04 三次均在相同的子框架获取步骤提前退出。 |
| `pnpm --filter @huhu/editor build:harness` + Chromium | 浏览器从带哈希的内页渲染 HTML，iframe 来源为 `null`，本地监听器收到 0 个请求。 |

[功能和隔离证据](html-preview.md) · Electron 重复测试与负载（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task04-e2e-repeat.txt`） · 规定命令及查看器复跑原始结果（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task04-e2e-viewers.txt`）

F04 子框架时序对照在生产渲染器与 preload 相同的条件下交替执行。仅把协议会话退回 `212f1cd` 也会出现单次查询得到空框架。等待框架挂载后，F04 行为断言在两个构建均为 3/3。对照输出（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/layout/task04-f04-diagnostic.txt`）

## task05 · 集成后的预览测试与通知区

开工将 `closeout/issue2-integration` 的 `190605a` 合入 layout，合并提交为 `9714480`。按集成锁文件安装后构建桌面应用。

上游 `CodeBlockView.dom.test.tsx` 原来要求固定文件名，并断言预览允许外部网络。用例现在从生产接线读取内页 URL，并核对现有隔离 CSP 与正文。继续断言没有 `srcdoc`。`PATCHES.md` 登记为测试改动，固定上游重放清单从 `copy` 更新为 `patch`。归档测试哈希清单保持只读。对归档后迁入的测试，`--check` 从重放清单读取固定上游 blob，已改用例计入测试改动，原样迁入用例仍需登记。

`zh-modern-web-guidance` 检索通知区域的可访问名称与快捷键，读取 `accessibility`。采用指南中 “Names are short and identify the element” 的做法，借用已有通知区的名称入口，不额外创建实时播报区域。

第一次生产扫描验证了测试能捕获问题。Lingui 将目录中的消息源文本编译为消息 ID，直接用原始英文查找会回退为英文。改用现有 Lingui React 宏生成并订阅相同消息 ID，再构建复验。集成版本逐命令实扫还覆盖了新挂载的表情选择器，发现 99 个英文分类名和表情可访问名称。

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | 退出 0。生产产物标识为集成合并 `9714480`，包含本轮实现。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/i18n-zh-hans.spec.ts tests/e2e/knowledge/preview-html.spec.ts` | 4/4 通过。两个中文扫描白名单外均为 0，编辑器通知名称随设置即时切换，隔离预览的外部探测请求为 0。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-parity-shell-mounts.spec.ts --grep '表情选择器\|源码模式的属性图标'` | 2/2 通过。英文检索、中文读屏名称、离线资源、键鼠插入、属性图标以及落盘重开均通过。 |
| `node scripts/ok-patches.mjs --check` | 266 项登记，无未登记或多余登记。JSON 中 `CodeBlockView.dom.test.tsx` 属于 `testsModified`。 |
| `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --refresh-replay` 与 `--replay` | 固定上游重放 1,346 个文件，文件集合和字节均为零差异。 |
| `pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`pnpm knip` | 均退出 0。Knip 保留两项已有配置提示。 |
| `pnpm test:vendor` | 最终独立复跑退出 0，330 个文件通过、6,391 个测试通过、4 个跳过。CodeBlockView 的 13 个测试全部通过。四进程并行复跑曾在测试断言全部通过后出现 Vitest worker 通信超时，最终用 `VITEST_MAX_FORKS=2`、`VITEST_MAX_THREADS=2` 重跑。 |

## task07 · 评论边缘按钮与富文本 Mod+K

实现提交 `fbea0f6df5cfd6265a34d88d3377962f1f959087`，生产 Electron 44.9.1（Chromium 152.0.7977.167）。集成分支仍在 `9b143a4`，开工分支已含该提交。OK 在独立工作树按固定 `44a2e0a6acce5952da0764746e3693fded5025b4` 从上游预构建启动，本轮使用新的隔离内容目录。用户授权追加 NotesModule 的批注打开订阅与根 Knip 的两条独立对照入口登记。

- 两端各跑评论和链接用例 2/2。D02 打开边缘按钮的 DOM 状态完全一致，两端均从「打开评论」变为「关闭评论」并显示 `Compare **bold** detail.`。链接场景的 URL 气泡在两端均获得焦点，命令面板未出现。两组最终 Markdown 分别逐字节一致，22 张成对步骤截图均为 1440 × 900。[对照说明](../parity-ok/README.md)
- Electron 专项用例 2/2。1100 像素宽时验证两条边缘按钮与对应正文的对齐、逐条 Tab 导航、鼠标和 Enter 打开、从「属性」切回同一线程以及详情栏开关时的点击遮挡。富文本用例覆盖选区创建链接、光标在链接内编辑并落盘、编辑器外和源码继续打开命令面板。源码正文保持原样。窄窗详情打开（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/narrow-detail-open.png`） · 窄窗详情关闭（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/narrow-detail-closed.png`）
- 保留上游原生按钮的键盘激活，未添加模拟 Enter 或 Space 的监听。沿用 28 像素按钮，在详情浮层盖住右侧留白时通过编辑区的实际几何和浮层挂载状态切换到左侧留白。Modern Web Guidance 使用 `accessibility` 的 “Don't attach keyboard handlers to native interactive elements” 与 `form-factor-adaptation` 的 “Let components respond to their container”。

| 验证 | 实际结果 |
| --- | --- |
| `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm format:check`、`pnpm knip` | 通过。Knip 保留两个既有依赖配置提示。默认 Playwright 发现 149 项，包含两条新 E2E。固定 OK 的对照脚本仍由独立配置发现。 |
| `node scripts/ok-patches.mjs --check`、`--replay` | 通过。上游原始归档未改动，重放 1,346 个文件，文件集合及字节零差异。 |
| 新增专项 `--repeat-each=5` | 10/10，3.9 分钟。运行时额外启动两个 CPU 压力进程，起始 1 分钟负载均值 37.17，同时有默认全量 E2E。 |
| `pnpm test` | 首次同机并行时 10 失败、987 通过、1 跳过。降低并发执行 `pnpm test --maxWorkers=2` 后 997 通过、1 跳过，退出 0。 |
| `pnpm test:vendor` | 首次 6,391 通过、4 跳过，worker `onTaskUpdate` RPC 超时使本轮失败。用 `VITEST_MAX_FORKS=2 VITEST_MAX_THREADS=2 pnpm test:vendor --maxWorkers=2` 重跑，330 文件通过，6,391 通过、4 跳过，退出 0。 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/shell.spec.ts` | 初轮在 `fbea0f6` 上完整跑完，144 通过、4 失败、1 跳过，25.7 分钟。两条新增用例均通过。属性评论移动后的树行超时，独立复跑 1/1。H03 未等到格式气泡，独立复跑 3/3。另有快捷键表固定六行断言和 Agent CLI 退出后的终端关闭超时。 |

设置页按组合键标识行。修订提交 `c43813e0853cbb66fa8bd28d7903e68273e63267` 改成一个 Mod+K 条目，说明富文本内编辑链接和其他位置打开命令面板。新增 E2E 也检查该设置行实际显示。该修订不涉及键盘处理、评论位置或已有对照截图。

最终构建 `c43813e` 重跑 `shell.spec.ts` 共 46/46，设置快捷键表、命令面板和 Agent CLI 结束状态通过。属性评论持久化在最终构建复跑通过。旧 H03 中文扫描仍间歇性等不到「粗体」气泡，最终低并发复跑为 1/3，另一次最终构建复跑为 0/3。两轮均在中文扫描断言之前失效。保留这项回归记录，未更改旧用例或选区同步逻辑。

最终负载复验先在现有真实编辑器里用 DOM Range 准备确定的段落选区，确认选区后再点击评论按钮或发送真实 Mod+K。两个新增用例各五次，总计 10/10，耗时 52.4 秒。使用两个额外 CPU 压力进程，起始 1 分钟负载均值 3.22。此前按 Home/Shift+End 准备选区的轮次曾在触发操作前失败。窄窗截图使用最终负载复跑记录。

本机日志位于 `/tmp/huhu-task07.1cjmwH`。原始全量见 `delivery-full.log`，最终 Shell 见 `settings-shell.log`，专项负载见 `range-load.log`，旧 H03 的复验见 `settings-zh.log` 和 `quiet-zh.log`。
