# W01-01 Dashboard 网格对照夹具

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead — `t3p`
- terminal_address — `t1d8`
- task — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/report02.md`
- 执行结果 — `done`，已准备对照入口和脚本，运行结果与生产选型待 Lead 实测。

## 交付

在 `/home/wta/projects/huhu` 的共享主工作树实施。开始时 HEAD 为 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`，核对了 W01-01、设计、规格、原型确认与 t1d4 独立审查。夹具共用 Huhu 的六列、三个真实定义和稳定实例 ID。样本留有空位，覆盖输入、文字选择和不同卡片尺寸。保留 Huhu 生产看板作为对照。 [夹具目录](../../../../../temp/closeout-release/grid-comparison/) · [样本定义](../../../../../temp/closeout-release/grid-comparison/fixture.ts) · [运行说明](../../../../../temp/closeout-release/grid-comparison/README.md)

| 入口 | 本轮执行的候选代码 | 适配成本 |
| --- | --- | --- |
| Huhu | 生产 `Dashboard.tsx`、`dashboard-layout.ts` 和 CSS，使用原指针、碰撞、键盘与窄屏交互 | 夹具注入 Dashboard 控制器、三个合成内容和浏览器存取 |
| RGL | 发布包 `GridLayout` 原生拖动与缩放、`noCompactor`、键盘 `moveElement` | 53 行专用适配，负责位置和约束映射、回调与替代操作 |
| GridStack | 发布包原生拖动与缩放、float、`update`、`save(false)`、`destroy(false)` | 94 行专用适配，负责 React 与 DOM 节点生命周期、回调和几何序列化 |
| Homarr | 源码原件的 `constants.ts`、`geometry.ts`、`reflow.ts`，直接执行 `placeGridItem`、阅读序和逻辑像素函数 | 124 行专用适配负责 Pointer Events、尺寸约束、固定画布缩放与 React；覆盖纯布局模块及其交互包装 |

行数来自格式化后的候选文件，通用卡片、持久化与窄列投影另计。RGL、GridStack 和 Homarr 的窄列投影借用 Huhu 的排列函数，这部分结果用于衡量整套适配。存取以浏览器 localStorage 替代真实 Vault，布局与 revision 使用看板形状，业务操作使用合成数据。 [Huhu 接入](../../../../../temp/closeout-release/grid-comparison/main.tsx) · [RGL 适配](../../../../../temp/closeout-release/grid-comparison/rgl.tsx) · [GridStack 适配](../../../../../temp/closeout-release/grid-comparison/gridstack.tsx) · [Homarr 适配](../../../../../temp/closeout-release/grid-comparison/homarr.tsx)

## 版本与许可

| 候选与许可 | npm tarball integrity | npm gitHead | 本地参考 pin |
| --- | --- | --- | --- |
| react-grid-layout 2.3.0，MIT | `sha512-4ofzuR/MlYchp+ixDUVBxH6ybaw+JH51M+rpf675ik/++4Dn0Kax/Vf2Gv/7Z++mV1ZC7mY9UV2sRRycjGjKXQ==` | `9b01a614bcdd13e7e921cf3f4b1c7e77942421c1` | `ec4ab79c97448947b04601c2237b2861d94a0fcb` |
| gridstack 14.1.1，MIT | `sha512-7oxosr/htheY2QCgONtyMt/lQAS0z/34aQpib7X/VEDTWsINIiJQ/aI7+yVAvoW1GI7BhRBlbo/gXlXhLM/LOg==` | `9e45ce898c3bfd9d7b78d62110c60dd219e1c3b9` | `a7f828af1c5366c02aff8a8c8fafda2abbff58a6` |
| Homarr 2.13.1，Apache-2.0 | 从本地检出运行 | 从本地检出运行 | `b440fdd574c9daa229f5cf64f7b2532770799664` |

两份运行时 npm 发布包与本地参考检出的提交各自不同。已分别用 `npm view`、本地 `git rev-parse HEAD`、各许可证及 tarball 内实际导出声明核对。Homarr 从带 LICENSE 的原件直接导入布局函数。 [RGL npm 元数据](https://registry.npmjs.org/react-grid-layout/2.3.0) · [GridStack npm 元数据](https://registry.npmjs.org/gridstack/14.1.1) · [Homarr 许可](../../../../../temp/sources/homarr/LICENSE)

## Lead 运行命令

在夹具目录执行独立依赖安装。首次安装会产生本地 package-lock.json，可同产物一起留存。

```bash
cd /home/wta/projects/huhu/temp/closeout-release/grid-comparison
npm install --ignore-scripts --no-audit --no-fund
```

在第一个终端于该目录启动。

```bash
npm run start
```

在第二个终端于该目录串行运行。Chromium 使用 Huhu 已安装的 Playwright 浏览器。

```bash
HUHU_GRID_OUTPUT_DIR="$PWD/artifacts-$(date -u +%Y%m%dT%H%M%SZ)" node ../../../node_modules/@playwright/test/cli.js test -c playwright.config.mjs
```

每个候选有八个场景，依次检查跨列跨行和碰撞预览、两次保存后重开、尺寸 min/max、越界恢复和提示、输入／选区及查看态独立操作、键鼠移动和缩放等价、宽窄共享坐标、触摸移动及快速卸载。保存重开归在跨列跨行用例。输出目录的 `result.json` 包含所有通过和失败，个案目录带 trace、截图和几何 JSON。帧样本记录 rAF、支持时的 Long Animation Frame，以及 React commit；绝对时间受 dev server、Chromium、Playwright 与截图影响。卸载探针记录观察范围内的全局拖动监听与重挂后的提交，实际系统 DPI、实体触屏和读屏仍需对应环境。 [测试脚本](../../../../../temp/closeout-release/grid-comparison/comparison.spec.ts) · [串行配置](../../../../../temp/closeout-release/grid-comparison/playwright.config.mjs)

## 已做与未运行的验证

- 静态验证完成。读取上游实际导出、核对 tarball 的 CSS 和许可证、定位全部相对源码入口；两个配置通过 `node --check`，TS/TSX 通过 TypeScript 语法转换检查，夹具文件通过定向格式检查，`git diff --check` 通过。
- 依赖安装、Vite 服务、Playwright、截图、浏览器帧数据与全仓检查留给 Lead。运行时结果、候选达标情况和最终选择待出。按设计先判定 RGL，出现失败时留存最小失败路径及同条件 GridStack 证据。

### Modern Web Guidance

- **`drag`** 我把候选拖动限制在专门的把手，给输入和选区保留原生行为（“Start dragging from a dedicated handle”）。
- **`responsive-design`** 我用卡片容器尺寸控制详情显示，窄列仍按同一逻辑坐标投影（“adapt to their parent container's size”）。

## Lead 验收

Lead 已收取夹具代码与版本记录，未验收运行结果。首次启动存在 Homarr tsconfig 解析与 trace 资源触发 HMR 的入口问题，交 task03 修复；停止首轮，保留原始日志。
