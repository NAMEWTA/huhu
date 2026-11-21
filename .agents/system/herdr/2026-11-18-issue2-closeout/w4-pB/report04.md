# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pB
- task：task04.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task04.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report04.md
- 执行结果：blocked

## 结论

上游从自己的 `public/assets/preview-frame.html` 提供内页。Huhu 的桌面构建没有收录该目录，工作台的 CSP 也只允许 `huhu-preview:` 作为子框架来源。修复后，桌面端从既有隔离协议的专用静态入口提供内页，浏览器构建提供带哈希的 HTML 资源。生产预览 iframe 使用 `sandbox="allow-scripts"` 和 `connect-src 'none'`。真实 Electron 确认预览来源为 `null`，无法读取父页面，也没有 Node 或工作台桥接，五轮探测网络请求均为 0。

手写 HTML 和五种起始模板在真实 Electron 中均显示内容，实时编辑、保存写盘、关闭重开均通过。两个 F05 原用例在首次组合命令和三轮定向复跑中通过。F04 初次组合命令及三轮定向复跑均在切回预览时提前退出。使用 `212f1cd` 的协议会话做对照也复现了子框架查询为空。改用会等待子框架的断言后，两套构建的 F04 行为各通过三次。

## 产物与改动

工作目录为 `/home/wta/projects/huhu-wt-layout`，分支 `closeout/issue2-layout`。实现和验证证据已提交为 `a2145c320b58f8588eb3a97df861b36a7d1d1da2`，工作区干净。

- 预览内页、共享 CSP、Electron 协议接线和 vendor 补丁登记。
- 通过真实桌面编辑器验证六种预览及其安全边界。[新增 E2E](/home/wta/projects/huhu-wt-layout/tests/e2e/knowledge/preview-html.spec.ts)
- 根因、隔离、复跑和 F04 对照结果。[html-preview.md](/home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/html-preview.md) · [runs.md](/home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/runs.md)

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 类型、lint、格式、依赖检查 | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 均退出 0。 | `runs.md` |
| vendor 测试和补丁登记 | `pnpm test:vendor` 为 290 文件、6,009 通过、4 跳过。补丁检查 220 条登记，未登记与多余登记均为 0。 | `runs.md` |
| 真实生产构建 | `pnpm build` 退出 0，最终产物标识 `a2145c3`。最终构建的新增预览用例通过。 | `apps/desktop/out/build-info.json`、`/tmp/huhu-task04-committed.log` |
| Electron 负载复跑 | 预览用例 5/5。8 个逻辑核，开始至结束采样的 1 分钟负载为 27.54–62.54。 | `task04-e2e-repeat.txt` |
| 浏览器构建 | 构建编辑器 harness 后，用 Chromium 检查真实内页、沙箱来源和本地请求计数，均通过。 | `html-preview.md` |
| 规定的组合命令 | 首次 9/10，两个 F05 原用例通过，F04 原用例因框架挂载时序提前退出。 提交后重新构建再跑同一命令，仍为 9/10，唯一失败仍为 F04 的同一断言。 | `task04-e2e-viewers.txt`、`/tmp/huhu-task04-committed-viewers.log` |
| F04 对照 | 使用原协议与修复版各 3 次。单次查询分别有 1/3 和 3/3 为空，等待框架挂载后两套构建均 3/3，覆盖相对资源、脚本、保存后的预览更新。 | `task04-f04-diagnostic.txt` |

## 阻碍与接续

HTML 代码块交付和专用验证已完成。整个任务的 F04 原用例通过条件仍未满足。定向复跑中两次在子框架未挂载时取到空值，一次在读取时子框架已被替换。需由 Lead 协调在 `tests/e2e/workflows/viewers.spec.ts:289` 改用随挂载重试的 `FrameLocator` 断言，再复跑规定的组合命令。该文件不在 task04 的可写范围内。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过**。F04 原用例的子框架时序问题，w4:pC 在 closeout/issue2-session 的 b147410（“等待当前 HTML 预览”）里已经改了驱动，集成后再复核，不另派任务。
