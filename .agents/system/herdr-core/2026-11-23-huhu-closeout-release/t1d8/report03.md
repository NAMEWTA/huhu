# Dashboard 网格夹具启动修复

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead — `t3p`
- terminal_address — `t1d8`
- task — `task03.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/task03.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d8/report03.md`
- 执行结果 — `done`，入口修复和静态核对完成，待 Lead 重跑。

## 首轮失败与修复

在 `/home/wta/projects/huhu` 的主工作树完成夹具改动，基线为 `cc551778`。首轮 32 项由 Lead 提前停止，原日志及 `artifacts-first` 的五份 trace 保留。

- Vite 依赖扫描进入 Homarr 源码目录，读取 Next.js 的 tsconfig，在项目外无法解析 `@homarr/tsconfig/base.json`。夹具现在通过三个虚拟模块从固定的 `b440fdd574c9daa229f5cf64f7b2532770799664` 检出读取并编译 `constants.ts`、`geometry.ts` 和 `reflow.ts`。用 Huhu 已安装的 TypeScript 独立转换，运行仍使用原件算法。 [加载器](../../../../../temp/closeout-release/grid-comparison/homarr-source.mjs) · [Homarr 原件](../../../../../temp/sources/homarr/apps/nextjs/src/components/board/layout/reflow.ts)
- 首轮四份已结束 trace 记录页面在挂载 `.fixture-stage` 前访问 `node:crypto.randomInt` 抛错。Vite dev 按 ES 模块加载生产 contracts 聚合入口，会执行其 Node 端 ID 导出。夹具专用精确别名只转发生命周期所需的生产 `home` 和主题导出。 [浏览器转发入口](../../../../../temp/closeout-release/grid-comparison/browser-contracts.ts) · [首轮证据](../../../../../temp/closeout-release/grid-comparison/artifacts-first/)
- Vite 日志显示 trace HTML 的生成反复触发 reload。Vite 扫描入口限定为 `index.html`，文件监听忽略 `artifacts*`，Playwright 默认把新结果写到服务根外的兄弟目录。 [Vite 配置](../../../../../temp/closeout-release/grid-comparison/vite.config.mjs) · [Playwright 配置](../../../../../temp/closeout-release/grid-comparison/playwright.config.mjs) · [首轮运行日志](../../../../../temp/closeout-release/grid-runtime-first.log)

本轮在夹具配置和入口处理三处启动问题。原 32 项行为断言仍用于重跑。已核对 Homarr 布局源码目录与提交一致。生产代码、根锁文件、夹具依赖清单和历史产物无本轮写入。

## 验证

- Node 语法检查通过。用 Node 模块解析器静态链接虚拟模块及五个实际导出，三个读取路径都落在固定的 Homarr 源码目录。别名作用域、扫描入口、监听忽略规则、默认外置产物目录及 TS/TSX 语法检查通过。运行了 `git diff --check`。
- Worker 未启动 Vite、Electron 或 Playwright，未生成截图。入口在真实浏览器中是否加载成功、修复后无 trace reload，以及候选行为结果均由 Lead 重跑验证。

## Lead 重跑

在 `/home/wta/projects/huhu/temp/closeout-release/grid-comparison` 停止旧服务后重新执行 `npm run start`。同目录另开终端串行执行。

```bash
HUHU_GRID_OUTPUT_DIR="$PWD/../grid-comparison-results/artifacts-$(date -u +%Y%m%dT%H%M%SZ)" node ../../../node_modules/@playwright/test/cli.js test -c playwright.config.mjs
```

## Lead 验收

Lead 已核对入口修复，第二轮未再出现三项入口错误；实际页面暴露独立 stage ref 生命周期错误，转 task04 修复，保留全部失败 trace。尚无候选行为通过结论。
