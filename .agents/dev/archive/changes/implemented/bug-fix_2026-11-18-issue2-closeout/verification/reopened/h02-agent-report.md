# task01 · H02 交集清零与浮层样式修复

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- Pane `w4:pK`
- 任务 `task01.md`
- 任务文件 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pK/task01.md`
- 报告文件 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pK/report01.md`
- 工作树 `/home/wta/projects/huhu-wt-css`，分支 `closeout2/h02`，基线 `f16f614`，本地提交 `50747452f5b24a063c76fd734f278836e009f7d5`
- 执行结果 `done`

## H02 的原始集合与修复结果

以 `f16f614` 的源文件和桌面构建产物运行新守护，退出 1。A 采用宿主 `components`、`shell`、`modules` 层中的 CSS 类名，包括经 `@import … layer(…)` 进入的规则。B 从宿主 TSX/HTML 提取可静态识别的类 token，与所有宿主 CSS 规则求差，再和 OK 产物求交。迁移后的宿主 token 映射留在 `modules.huhu-ok`，高于原 OK 默认样式，其选择器仍受 C 的作用域检查。产物中的映射类名由宿主集成提供，Tailwind 集合来自原 OK 构建规则。 [基线实测](/tmp/huhu-h02-closeout/main-strict-final.log)

| 分类 | `f16f614` 实测 | 相对旧守护的差别 |
| --- | --- | --- |
| A，11 项 | `ProseMirror`、`cm-content`、`cm-editor`、`cm-searchMatch`、`cm-searchMatch-selected`、`cm-selectionLayer`、`cm-selectionMatch`、`grow`、`is-active`、`ok-root`、`tiptap-editor` | 十个原 A 项均实际出现在宿主界面层。新计入 `ok-root`，旧脚本只抓类选择器节点，漏掉其在宿主 `modules` 中的等价 `[class~="ok-root"]` 规则。 |
| B，12 项 | `border-t`、`flex`、`flex-1`、`flex-col`、`gap-1.5`、`h-full`、`min-h-0`、`overflow-y-auto`、`p-2`、`text-link`、`text-muted-foreground`、`text-xs` | `ok-root` 已有 CSS 规则，移出 B。批注表单的 `gap-1.5` 进入 B，旧脚本的字符限制漏掉带小数点的类 token。 |

候选构建 **A=0、B=0、C=0**，移除了 A/B 登记。后续任意非空 A/B 都打印分类与「待决」并退出 1。当前无需 Lead 裁决的交集。 [最终构建](/tmp/huhu-h02-closeout/build-final.log)

## 改动

- 宿主把共享 `grow` 改为 `hu-flex-fill`，并将引用菜单激活态、启动页错误操作和批注面板布局改用宿主类。CodeMirror 样式和 Tiptap 宽度、ProseMirror 字号迁至 OK 宿主映射，保留第三方运行时类名及原有作用域。映射直接使用 `.ok-root`，前缀检查只为该配置文件识别这一既有作用域名称。 [宿主映射](/home/wta/projects/huhu-wt-css/packages/editor/src/rich/token-map.css)
- 保留逗号成员原有间隔，将其移到作用域伪类之前。构建产物为 `:where(.ok-root, .ok-root *)::backdrop`，能选中自身为 `.ok-root` 的对话框背景。 [产物断言](/tmp/huhu-h02-closeout/backdrop-output.log)
- 气泡、路径和命令候选、检查提示、拖拽预览及图片缩放增加宿主浮层标记，读取宿主字体 token。拖拽预览沿用与原实现一致的正文计算字体。图片缩放库样式从现有依赖导入 OK 层，深色变体和遮罩跟随文档的 `data-mode="dark"`，保留独立预览的 `.dark` 入口。Vendor 修改登记为 P-H02-02。 [补丁登记](/home/wta/projects/huhu-wt-css/packages/editor/src/vendor/open-knowledge/PATCHES.md)

## 验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm build`（含 H02 守护） | 通过。提交后重建的 489 个 main/preload/renderer 文件集合和 SHA-256 与回归使用的产物一致。 | [构建](/tmp/huhu-h02-closeout/build-final.log)、[构建标识](/home/wta/projects/huhu-wt-css/apps/desktop/out/build-info.json)、[产物差异](/tmp/huhu-h02-closeout/bundle-diff.log) |
| 负例及 PostCSS 产物测试 | 21 项全部通过，覆盖宿主层、类属性选择器、TSX/HTML token、转义的小数类名、根外规则和逗号成员的 backdrop 产物。 | [守护套件](/tmp/huhu-h02-closeout/guards-final.log) |
| `lint`、`typecheck`、`knip`、`format:check`、`notices` | 通过 | [lint](/tmp/huhu-h02-closeout/lint-final.log)、[typecheck](/tmp/huhu-h02-closeout/typecheck.log)、[knip](/tmp/huhu-h02-closeout/knip.log)、[格式](/tmp/huhu-h02-closeout/format.log)、[notices](/tmp/huhu-h02-closeout/notices.log) |
| `test` 与 `test:vendor` | 仓库 Vitest 1006 通过、1 跳过。Vendor 6427 通过、4 跳过。最终守护套件见上行。 | [仓库](/tmp/huhu-h02-closeout/unit.log)、[vendor](/tmp/huhu-h02-closeout/vendor.log) |
| `ok-patches --check`、`--refresh-replay`、`--replay` | 登记无漏项或多余项。1,348 个文件集合与字节均零差异。 | [登记检查](/tmp/huhu-h02-closeout/ok-patches-check.log)、[刷新](/tmp/huhu-h02-closeout/replay-refresh.log)、[重放](/tmp/huhu-h02-closeout/replay.log) |
| 七个非知识库屏幕对 main | 工作台、任务、收件箱、设置、保险箱、自动化、版本历史 × Claude 亮暗，14 份默认状态计算样式全部零差异。 | [采集日志](/tmp/huhu-h02-closeout/screens.log)、[逐屏差异](/tmp/huhu-h02-closeout/seven-screens-diff.json) |
| Electron 浮层字体 | Electron 44.9.1 / Chromium 152.0.7977.167。四主题 × 亮暗，六类浮层和模拟移除根标记后的继承值一致。Vercel 使用 Geist，Claude 与 Notion 使用 Inter，Apple 使用其宿主系统字体栈。拖拽预览由生产拖拽处理创建，正文内联字体一致。桌面宿主的 lint 服务由 Q2 禁用，此项用同样的 body 挂载结构和类名验证实际产物 CSS。 | [测量与起止负载](/tmp/huhu-h02-closeout/portals.log)、[逐项计算样式](/tmp/huhu-h02-closeout/portal-computed.json)、[探针](/tmp/huhu-h02-closeout/runtime.mjs) |
| Electron 图片真正展开 | 明色遮罩为不透明白色。深色遮罩等于宿主背景，Claude `rgb(24, 23, 21)`、Apple `rgb(37, 37, 39)`、Notion `rgb(26, 26, 26)`、Vercel `rgb(10, 10, 10)`。全部实际打开 `dialog`，遮罩位置为 `absolute`，dialog 自身是 OK 根。 | [计算样式](/tmp/huhu-h02-closeout/portal-computed.json)、[Claude 深色截图](/tmp/huhu-h02-closeout/zoom-claude-dark.png)、[Vercel 深色截图](/tmp/huhu-h02-closeout/zoom-vercel-dark.png) |
| 独立 Web harness | 构建通过。独立 Chromium 中，编辑器与文件树页面的同名工具类在 OK 根内为 flex，根外为 block。 | [构建](/tmp/huhu-h02-closeout/build-harness.log)、[浏览器](/tmp/huhu-h02-closeout/web-harness.log) |
| 指定 12 个 Playwright 文件 | 116 项通过，零重试，单 worker。启动前确认没有其他活动的 Electron 或 Playwright。11 月 20 日 02:07:56 至 02:18:30（UTC+8），一分钟负载 11.15 → 2.67。 | [零重试日志与起止 uptime](/tmp/huhu-h02-closeout/e2e.log)、[运行产物](/tmp/huhu-h02-closeout/e2e-results/) |

## 阻碍与接续

无。提交留在本地分支，工作树干净。

## Lead 验收
