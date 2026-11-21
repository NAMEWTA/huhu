# task02 · H02 严格守护与浮层子节点主题

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- Pane `w4:pK`，任务 `task02.md`
- 任务文件 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pK/task02.md`
- 报告文件 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pK/report02.md`
- 工作树 `/home/wta/projects/huhu-wt-css`，分支 `closeout3/h02`，基线 `f9f0186`，本地提交 `8a4f7d070a2387e7ccd9a70e16cf3756ac4344a9`
- 执行结果 `done`

## 严格守护与迁层

严格统计宿主 `components`、`shell`、`modules` 及全部子层，涵盖分层导入与嵌套子层。将新守护器用于 `f9f0186` 的完整样式源和桌面构建，退出 1。A=9，分别为 `ProseMirror`、`cm-content`、`cm-editor`、`cm-searchMatch`、`cm-searchMatch-selected`、`cm-selectionLayer`、`cm-selectionMatch`、`ok-root`、`tiptap-editor`。旧脚本从 A 的宿主侧漏算 `modules.huhu-ok`，新脚本补计该子层。B=0、C=0。 [基线判红](/tmp/huhu-h02-task02/strict-before.log)

将 OK 根、第三方编辑器、Tiptap 容器及其宿主尺寸规则迁到 OK 输入 `vendor.ok-host`。提前声明子层顺序，令该层位于所有 `vendor.ok-*` 默认层之后。规则以真实类选择器限定在 OK 根内，构建仍逐条执行 C 作用域检查。`tokens` 中原有的文件树 `!important` 映射保留原层次，以维持重要声明的反向层叠。最终 **A=0、B=0、C=0**，后续任一非空 A/B 仍列为「待决」并退出 1。 [映射文件](/home/wta/projects/huhu-wt-css/packages/editor/src/rich/token-map.css) · [构建](/tmp/huhu-h02-task02/build-final.log)

`f9f0186` 与只迁层且尚未应用浮层视觉变动的构建对照，七个常规非知识库页、四个归档非知识库差异页，以及知识库、富文本、阅读、源码共 **15 屏 × 四主题 × 明暗，120 份默认状态计算样式零差异**。复用项目视觉采集器、固定 Vault、固定时钟和 1440×900 视口。 [120 个逐屏结果](/tmp/huhu-h02-task02/baseline-migration-styles.json) · [采集器](/tmp/huhu-h02-task02/visual.mjs)

## 真实浮层子节点

用 Electron 44.9.1 / Chromium 152.0.7977.167 打开笔记、选中文本并悬停粗体按钮。气泡、共享 Radix 容器中实际显示的 tooltip 及可见 `Ctrl B` 键帽均匹配宿主完整 `--font-ui` 字体栈。修复前 Vercel 的 tooltip 为 `"Inter Variable", sans-serif`，修复后为 Geist 宿主栈。基线的可见键帽已被宿主 `components` 层的 `kbd` 声明覆盖，实际字族与新版本一致。此次 OK 映射显式覆盖键帽的 `font-sans` 默认值。 [基线采样](/tmp/huhu-h02-task02/portals-baseline.json) · [候选采样](/tmp/huhu-h02-task02/portals-candidate.json) · [宿主键帽规则](/home/wta/projects/huhu-wt-css/packages/ui/src/styles/components/core.css:144)

| 主题 | 实际浮层字体首选族（明暗均同） | 气泡圆角 | 气泡阴影 |
| --- | --- | --- | --- |
| Claude | Inter Variable | 10 → 12 px | 亮、暗均等于各自宿主 `--shadow-popover` |
| Apple | -apple-system | 10 → 12 px | 同上 |
| Notion | Inter Variable | 10 → 8 px | 同上 |
| Vercel | Geist Variable | 10 → 8 px | 同上 |

共享容器与气泡标记登记为 P-H02-03。留档 16 张基线与候选四主题明暗截图。 [Claude 亮色](/tmp/huhu-h02-task02/portal-candidate-claude-light.png) · [Vercel 暗色](/tmp/huhu-h02-task02/portal-candidate-vercel-dark.png) · [浮层批次](/tmp/huhu-h02-task02/portals.log) · [补丁登记](/home/wta/projects/huhu-wt-css/packages/editor/src/vendor/open-knowledge/PATCHES.md)

## rc.4 非知识库视觉对照

以实机启动的 `9132640`（rc.4）、`f9f0186` 和候选构建为三方对照，复用视觉夹具、默认状态采集器、截图遮罩与容差。以下每格为「计算样式差异数 / RGB 异动像素数」。逐属性和图像对照保存在取证目录。 [归档判定](/home/wta/projects/huhu-wt-css/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/visual-compare-rc4.md) · [本次逐项样式](/tmp/huhu-h02-task02/rc4-candidate-styles.json) · [像素对照](/tmp/huhu-h02-task02/rc4-candidate-pixels.json)

| 页面 | rc.4 → 候选 亮 | rc.4 → 候选 暗 | f9f0186 → 候选 亮 | f9f0186 → 候选 暗 | 归档与来源 |
| --- | ---: | ---: | ---: | ---: | --- |
| 工作台 | 0 / 38 | 0 / 0 | 0 / 0 | 0 / 13 | 无样式差异，像素差在 40 px 栅格噪声容差内 |
| 任务主页 | 0 / 10 | 0 / 0 | 0 / 10 | 0 / 0 | 同上 |
| 收件箱 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 同上 |
| 设置主页 | 0 / 14 | 0 / 0 | 0 / 14 | 0 / 0 | 同上 |
| 保险箱 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 44 | 同上 |
| 自动化 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 同上 |
| 版本历史 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 同上 |
| 新建任务弹层 | 44 / 164359 | 44 / 183323 | 0 / 0 | 0 / 0 | 归档内预期变化，`c424843` 紧凑编辑器使弹层约增高 56 px |
| 任务详情 | 58 / 89890 | 58 / 59049 | 0 / 0 | 0 / 44 | 归档内预期变化，`c424843` 使描述区高约 90 → 210 px |
| 能力网关 | 10 / 61 | 10 / 63 | 0 / 25 | 0 / 0 | 归档内预期变化，`7394578` 重命名与 `55903af` 扩充能力说明影响表格文本高度 |
| 设置·关于（默认） | 19 / 677 | 19 / 677 | 0 / 0 | 0 / 0 | 已有来源文本变化，`49b65da` 删除 Atomic 条目并更正 OK 描述，`06fcd0f` 补 Orca PDF 查看器说明 |
| 设置·关于（展开许可证） | 21 / 12058 | 21 / 11987 | 0 / 0 | 0 / 0 | 归档内预期变化，`17293ea` 刷新 OK 依赖许可，`bfeb509` 与 `190605a` 进一步更新生成文本 |

七个常规页面对 rc.4 的 14 份计算样式全部一致，11 张截图逐像素一致。其余三张分别相差 10、14、38 像素，最大单通道差 1，均在仓库 40 像素容差内。候选对 `f9f0186` 的 24 份计算样式全部一致。其中保险箱暗色与任务详情暗色各有 44 个像素的稀疏差异，分别超过默认容差 4 像素，最大单通道差分别为 2 和 4。差异位置分布在多个边缘，与前一轮截图位置不重合，符合栅格化噪声的表现。原始像素数保留在上表。 [即时基线逐属性](/tmp/huhu-h02-task02/baseline-candidate-styles.json) · [即时基线像素](/tmp/huhu-h02-task02/baseline-candidate-pixels.json)

归档登记的四个页面仍有历史差异。关于页默认视图还显示了来源链接的删改，这一细项在归档的许可证说明之外，已存在于 `f9f0186`。展开许可证后，实测正文高 21,346.2 → 32,413.2 px，归档候选曾记录约 33,898 px。能力网关表格约 8,461.5 → 8,707.5 px，归档候选曾记录约 8,584 px。逐项来源见上表，两页的当前差异在 `f9f0186` 对照中均已出现。 [原始 rc.4 到基线对照](/tmp/huhu-h02-task02/rc4-baseline-styles.json)

首轮发现任务弹层采样可能早于正文就绪。复测对新建弹层等待实际 ProseMirror，对详情等待夹具正文「列出三件最重要的事」及有效布局高度，再重新采样三方。复测确认任务弹层和详情相对 `f9f0186` 的计算样式、布局均一致。 [首轮证据](/tmp/huhu-h02-task02/rc4-first-sample/) · [就绪后复测](/tmp/huhu-h02-task02/settled-task-detail.log)

## 验证

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| `pnpm build`、`check:ok-css` | 通过，A/B/C 均 0。提交前后 489 个 main/preload/renderer 文件集合与 SHA-256 零差异。 | [最终构建](/tmp/huhu-h02-task02/build-final.log) · [构建标识](/home/wta/projects/huhu-wt-css/apps/desktop/out/build-info.json) |
| `lint`、`typecheck`、`knip`、`format:check`、`notices` | 通过 | [lint](/tmp/huhu-h02-task02/lint-final.log) · [类型](/tmp/huhu-h02-task02/typecheck.log) · [knip](/tmp/huhu-h02-task02/knip.log) · [格式](/tmp/huhu-h02-task02/format.log) · [声明](/tmp/huhu-h02-task02/notices.log) |
| `test`、`test:vendor` | 守护测试 21/21，仓库 Vitest 1006 通过、1 跳过，vendor 6427 通过、4 跳过。 | [仓库与负例](/tmp/huhu-h02-task02/unit.log) · [vendor](/tmp/huhu-h02-task02/vendor.log) |
| `ok-patches --check`、刷新、重放 | 说明与实际文件路径一致。重放 1,348 个文件，集合与字节零差异。 | [登记核对](/tmp/huhu-h02-task02/ok-patches-check.log) · [刷新](/tmp/huhu-h02-task02/replay-refresh.log) · [重放](/tmp/huhu-h02-task02/replay.log) |
| 指定 Electron E2E | 112 项通过，零重试，单 worker。启动前无其他活动 Electron/Playwright。11 月 20 日 07:33:55–07:43:11（UTC+8），一分钟负载 4.25 → 4.37。 | [零重试、进程检查和起止 uptime](/tmp/huhu-h02-task02/e2e.log) |
| 独立 Web harness | 独立 Chromium 的编辑器与文件树均通过。相同工具类在 OK 根内为 flex、根外为 block。 | [构建](/tmp/huhu-h02-task02/build-harness.log) · [运行](/tmp/huhu-h02-task02/web-harness.log) |

## 阻碍与接续

无。提交留在本地分支，工作树干净。

## Lead 验收

- 2026-11-20 Lead：接受，待集成后复验。8a4f7d0 把映射迁入 `vendor.ok-host`，严格守护计入 `modules` 全部子层，A/B/C=0；浮层子节点映射登记为 P-H02-03；rc.4 常规页面 computed style 零差异。专项 E2E 运行时一分钟负载 4.25–4.37，属功能测试，不作性能证据。`vendor.ok-host` 是否属于合法 OK 输入层，交独立审查在集成候选上判定。
