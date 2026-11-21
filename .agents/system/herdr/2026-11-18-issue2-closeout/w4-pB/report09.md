# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pB
- task：task09.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task09.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report09.md
- 执行结果：done

## 结论

`OkExplorer` 现在按 `deps` 注册文件路由，隐藏与菜单回调由独立的 effect 更新。新建笔记完成与树首次挂载同批时，首个根目录响应包含新笔记，真实列举和树行均可见。

沿用 `host-fetch.ts` 的空文档兜底。详情等入口可能先于文件路由挂载并请求文档列表，现有兜底为这些调用方返回合法空列表。把它改成错误会改变其他调用者的加载行为，且不能保证发起重试。本次通过保持文件路由注册，直接消除已复现的注销窗口。

纯键盘用例在确认新笔记的树行后等待创建对话框关闭、文档标签可见，再聚焦功能图标栏的「任务」。验证实际焦点后按 Enter，确认任务模块挂载，再继续新建任务和键盘改状态。未新增固定等待。

## 产物与改动

- 工作目录 `/home/wta/projects/huhu-wt-layout`，分支 `closeout/issue2-layout`。按要求快进到 `cf882bd7805f99b73b0e4c4f9753eb160759de4d`。任务提交 `affeb58d777fc6e0b5f1643462cda12bd53c1d84`，提交后工作树干净。
- 修改 `packages/editor/src/host/explorer.tsx` 和 `tests/e2e/a11y.spec.ts`，新增 `tests/e2e/knowledge/explorer-first-listing.spec.ts`。保留 `94e79ea` 之后的其他文件树逻辑。
- 首次列举用例沿用 pD 的时序控制，只在临时 Electron 构建副本中门控已完成的创建回调和树的首次挂载，并固定同批 `onHide` 回调变化。首个响应来自实际 hostFetch，根目录数据来自实际 `onListed`，树行来自实际 FileTree。用例检查构建标记唯一，打包输出若变动会明确报出标记差异。

## 验证

日志根目录 `/tmp/huhu-task09.DG2BIT`。基线和最终生产构建均通过 `pnpm build`，最终 `build-info.json` 为 `affeb58`。每批 E2E 启动前用进程表确认无其他 Electron 或 Playwright 测试进程，所有批次串行运行。表内负载为 `uptime` 的 1/5/15 分钟均值，起止原文及进程检查留在相应 `*-before.txt`、`*-after.txt` 和 `*-preflight.log`。

| 验收要求 | 实际检查与结果 | 起止负载及日志 |
| --- | --- | --- |
| 修复前的受控回归 | 基线 `cf882bd` 上同一最终用例因首个根目录响应是 `[]` 失败。此轮后续刷新补回树行，用例仍能检测首个响应缺失。 | `2.57 / 1.82 / 2.81` → `2.36 / 1.79 / 2.80`，`first-listing-confirmed-red.log` |
| 修复后的受控回归 | `xvfb-run -a pnpm exec playwright test tests/e2e/knowledge/explorer-first-listing.spec.ts --retries=0`，1/1。首次响应、真实根目录和可见树行均包含新笔记。 | `13.37 / 6.41 / 4.35` → `12.46 / 6.34 / 4.34`，`first-listing-green.log` |
| 受影响单测 | `pnpm exec vitest run packages/editor/test/host-files.test.ts plugins/notes/test/explorer-deps.test.ts --maxWorkers=1`，20/20。 | `unit.log` |
| 静态检查 | `pnpm typecheck`、`pnpm lint`、`pnpm knip`、`pnpm format:check` 均退出 0。Knip 保留两条既有依赖配置提示。 | `typecheck.log`、`lint.log`、`knip.log`、`format-check.log` |
| `tests/e2e/a11y.spec.ts --retries=0` | 4/4，39.4 秒。 | `12.46 / 6.34 / 4.34` → `7.60 / 5.82 / 4.25`，`a11y.log` |
| `tests/e2e/a11y.spec.ts:64 --repeat-each=30 --workers=6 --retries=0` | 30/30，37.7 秒。 | `7.60 / 5.82 / 4.25` → `17.91 / 8.71 / 5.29`，`keyboard-pressure.log` |
| `explorer-keyboard.spec.ts`、`journey.spec.ts`、`workflows/acceptance.spec.ts`，零重试 | 46/46，2.9 分钟。 | `17.91 / 8.71 / 5.29` → `2.86 / 5.91 / 4.79`，`explorer-workflows.log` |

探针初版只门控挂载和关闭，未固定回调变更，基线上未复现。第二次探针遇到编译后多行标记未匹配，调整为稳定的返回分支标记后取得上表的基线失败及修复通过。两次初步运行也保留了日志和起止 `uptime`。

## 阻碍与接续

无。指定验证均已完成，未运行全量 E2E。

### Modern Web Guidance

- `accessibility` 依照 “Manage focus correctly to and from updated content”，以原生模态框关闭与文档标签可见作为切换键盘焦点的前置条件。
- `js` 依照 “Externalized Promise Settlement” 使用 `Promise.withResolvers()` 把探针的释放动作交给 Playwright，按实际应用状态释放异步提交。

## Lead 验收


Lead（2026-11-19）：接受。explorer.tsx 拆分 effect 与 pD 建议一致，受控回归红→绿；host-fetch 兜底保留的理由成立。已 --no-ff 合入集成分支。
