# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pB
- task：task01.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report01.md
- 执行结果：blocked

## 结论

F07 和 F08 已实现并通过对应验证。H03 扫出 28 个白名单外的英文标签，且当前设置契约没有界面语言项。G07 已取得构建体积、实际按需加载和两轮启动对照，工作台冷启动 p95 与收件箱 p95 在两轮均高于 rc.4，未满足无回退条件。

## 产物与改动

工作目录为 `/home/wta/projects/huhu-wt-layout`，本地分支 `closeout/issue2-layout`。业务上线候选构建为 `81689818d2a328b4a0073644a7f6fce340a1e16a`，证据提交为 `a842d06`。工作区干净。

- `784058e` 实现编辑区内的详情栏布局、窄栏操作收纳和 OK 主题映射，加入三项 Electron 验证及启动测量脚本。
- `585b997` 隔离矩阵用例的 Electron 缩放状态。`f1cec8f` 映射文件树的操作按钮颜色。`34e7547` 收纳极窄布局的视图标签。`19a0ef0` 等待文件树颜色过渡结束再审计。`8168981` 为紧凑模式下拉留出文本空间。
- `a842d06` 保存 [F07](</home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/f07-toolbar.md>)、[F08](</home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/f08-theme.md>)、[H03](</home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/h03-i18n.md>)、[G07](</home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/g07-budget.md>) 和 [运行记录](</home/wta/projects/huhu-wt-layout/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/layout/runs.md>)。
- rc.4 对照工作树保留在 `/home/wta/projects/huhu-wt-rc4`，detached HEAD 为 `913264045cee1818497a37a57715c664aa85a1ae`。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| F07 工具栏 | 基线 1280 px 重现七个控件被挡。修复后 96/96 组合命中通过，并实际点击了添加批注与笔记操作。最终构建重跑 800 px 的 16 个组合通过 | `evidence/layout/f07-toolbar.md`、`shots/` |
| F08 主题 | 8/8 主题模式、24 个界面状态通过稳定色扫描，未知色 0。最终构建 a11y 4/4 通过 | `evidence/layout/f08-theme.md`、`f08-computed-colors.json`、`a11y-final.txt` |
| H03 简体中文 | 未通过。树 1、气泡菜单 6、斜杠菜单 21 个白名单外的英文标签。语言即时切换未执行 | `evidence/layout/h03-i18n.md`、`h03-zh-hans.json` |
| G07 体积、惰性加载、启动 | 最终桌面构建比 rc.4 增加约 23.39 MB。两轮各有 20 对有效启动样本。复测的工作台 p50/p95 从 1410.2/1580.7 ms 增至 1501.1/1803.2 ms，首篇笔记为 702.4/748.1 ms。CDP 确认编辑器块只在进入知识库后出现。非知识库无回退未通过，独立 .deb 构建未产出 | `evidence/layout/g07-budget.md`、`g07-*.jsonl` |
| 通用门禁 | `typecheck`、`lint`、`test`、vendor 补丁核对、`build`、`format:check`、`knip` 通过。默认 `test:vendor` 初跑发生 worker RPC 超时。限制并行后退出 0，4173 通过、2 跳过 | `evidence/layout/runs.md` |
| 知识库与 a11y 全量 | 首轮 43 通过、1 跳过、3 失败。宿主路由在清理缩放状态后连续 3 次通过，F08 专项通过，H03 仍失败 | `evidence/layout/e2e-first.txt`、`host-routes-retry.txt`、`runs.md` |

## 阻碍与接续

H03 需要允许修改绕过 Lingui 的 vendor 文案来源和文件树依赖的读屏名称。即时语言切换还依赖 Huhu 设置契约和设置页提供语言选项，并把该值传给编辑器、批注和文件树。

G07 的最终按需加载已证实。继续关闭该项需要定位非知识库冷启动尾延迟并重测，或由 Lead 根据双轮原始记录作预算决定。相对测量样本使用业务构建 `34e7547` 和 `585b997`，最终 `8168981` 只追加紧凑模式下拉的 CSS 内边距，已重新取体积与模块记录。

## Lead 验收


（Lead 追加，2026-11-18）**验收：F07、F08 通过，H03、G07 返工**。核对：7 个提交，diff 范围在任务内。H03 的 Lead 决定：Huhu 设置契约里没有界面语言项（`packages/contracts` 中没有 locale 设置，`OkRoot` 固定激活），“切换语言即时生效”这一条在 Huhu 里不适用，增加语言设置超出 Issue #2 范围，登记即可；28 个白名单外的英文标签必须补齐。G07：`v0.0.1-rc.4..main` 的 128 个提交几乎都是本 Issue 的工作，冷启动 p95 的回退应当算在本 Issue 上，需要定位并修复。后续任务见 w4:pB/task02.md。
