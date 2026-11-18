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
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-toolbar.spec.ts -g '1280px 下详情'`（9f870c0） | 1 | 1 个用例复现七处中心点被遮挡。[日志](f07-before.txt) |
| 同一命令（首次实现） | 0 | 1 个用例通过 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-toolbar.spec.ts`（迭代） | 1 | 发现窗口最小尺寸、树行焦点、详情标签初始化和 CSS 宽度取整需要在驱动中处理 |
| 同一测试以 `-g 1439px --repeat-each=3` 重跑 | 0 | 3 次通过。[日志](f07-1439-retry.txt) |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/a11y.spec.ts` | 1 | 43 通过、1 跳过、3 失败。详见 [首次全量日志](e2e-first.txt)。四条 a11y 均通过。失败为残留缩放影响宿主路由用例、H03 英文残留、F08 发现文件树 Shadow DOM 尚有非主题颜色 |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s3-toolbar.spec.ts tests/e2e/knowledge/host-routes.spec.ts -g 'F07：\|宿主路由'`（585b997） | 0 | 修正测试退出时的缩放清理后 8 条通过。[日志](f07-with-host-routes.txt) |
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
| `xvfb-run -a pnpm e2e tests/e2e/knowledge/host-routes.spec.ts --repeat-each=3`（8168981） | 0 | 3/3 通过。[日志](host-routes-retry.txt) |
| `xvfb-run -a pnpm e2e tests/e2e/a11y.spec.ts`（8168981） | 0 | 4/4 通过。[日志](a11y-final.txt) |
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
