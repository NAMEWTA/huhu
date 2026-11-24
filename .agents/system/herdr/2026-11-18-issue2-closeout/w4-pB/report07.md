# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pB
- task：task07.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task07.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report07.md
- 执行结果：done

## 结论

- D02 复用了固定上游已有的 `CommentMarginRail`。正文边缘按钮可用鼠标或键盘打开对应线程。1100 像素宽、两条评论的场景已验证详情开、关及从「属性」页再次打开线程。详情浮层覆盖右侧留白时，按钮移到左侧留白。
- 知识库富文本中，Mod+K 在选区有文字或光标位于链接内时，把焦点移到气泡工具栏的 URL 输入，更新可以保存。源码模式和富文本外保留命令面板，源码正文未被快捷键改写。设置页同一 Mod+K 条目说明两个场景。
- 固定 OK 与 Huhu 各 2/2。边缘按钮的名称变化、打开的线程正文和链接快捷键的焦点状态一致，两个样本的最终 Markdown 逐字节一致。边缘按钮和富文本快捷键已按等价登记，其余评论行为按 task06 的 Lead 裁定更新。

## 产物与改动

- 工作目录 `/home/wta/projects/huhu-wt-layout`，分支 `closeout/issue2-layout`。开工时集成 tip `9b143a4` 已在分支历史中。提交 `fbea0f6df5cfd6265a34d88d3377962f1f959087` 实现功能，`c43813e0853cbb66fa8bd28d7903e68273e63267` 完善快捷键登记，`f3c7747a7e660f18ecce9bf3ca9332f97bfd4cd6` 保存最终测试和证据。提交后工作树干净。
- vendor 改动已在 `PATCHES.md` 登记，重放文件由脚本刷新。原 OK 工作树及归档测试清单未被修改。按用户追加授权，在 `NotesModule.tsx` 接入批注打开事件，在 `knip.json` 登记独立对照入口。选区同步与 flush 逻辑维持原样。
- 新增 `tests/e2e/knowledge/comments-edge-rail.spec.ts`、`tests/e2e/knowledge/editor-link-shortcut.spec.ts`。实跑截图、DOM 和 Markdown 见 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity-ok/`，含 `README.md` 与 `unaligned.md`。验收及复跑记录见同级 `layout/runs.md`。

## 验证

日志根目录 `/tmp/huhu-task07.1cjmwH`。最终生产构建 `c43813e` 使用 Electron 44.9.1、Chromium 152.0.7977.167。成对对照使用相同功能代码的 Huhu `fbea0f6` 和固定上游 `44a2e0a6acce5952da0764746e3693fded5025b4`，后续产品修订只合并快捷键设置条目。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 两项专项及五次负载重复 | 两项独立运行 2/2。最终构建使用两个额外 CPU 压力进程，各重复五次，总计 10/10，耗时 52.4 秒。最终夹具先用 DOM Range 确定段落选区，再执行真实点击和按键。 | `delivery-focused.log`、`range-load.log`、窄窗成对截图 |
| 两侧对照复跑 | 固定 OK 2/2，Huhu 2/2。DOM 检查无采集失败，两对 Markdown 字节一致，22 张步骤截图均为 1440 × 900。新增两张窄窗截图均为 1100 × 900。 | `parity-ok.log`、`delivery-parity-huhu.log`、`evidence/parity-ok/` |
| 类型、格式、构建及 Knip | `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm format:check`、`pnpm knip` 均通过。Knip 保留两个既有依赖配置提示。 | `settings-typecheck.log`、`settings-build.log`、`range-lint.log`、`range-format-check.log`、`range-knip.log` |
| `pnpm test` | 初轮 10 失败、987 通过、1 跳过。降低并发复跑 `pnpm test --maxWorkers=2`，997 通过、1 跳过，退出 0。 | `test.log`、`delivery-test.log` |
| `pnpm test:vendor` | 初轮断言 6391 通过、4 跳过，Vitest worker RPC 超时。降低并发复跑，330 文件通过，6391 通过、4 跳过，退出 0。 | `test-vendor.log`、`delivery-test-vendor.log` |
| vendor 清单检查与重放 | `node scripts/ok-patches.mjs --check` 与 `--replay` 通过。未登记和多余登记均为 0，固定上游重放 1346 个文件，字节零差异。 | `check-patches.log`、`replay.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/shell.spec.ts` | 首轮 144 通过、4 失败、1 跳过。最终 Shell 独立复跑 46/46，设置快捷键和 Agent CLI 结束状态均通过。属性评论移动后的树行用例在最终构建通过。旧 H03 中文扫描仍间歇性等不到格式气泡，最终低并发复跑为 1/3。 | `delivery-full.log`、`settings-shell.log`、`settings-knowledge.log`、`quiet-zh.log` |

## 阻碍与接续

两项指定行为已完成、复验并提交。旧 H03 的全量回归风险仍在，失败出现在本地化扫描断言之前的「粗体」气泡等待，留有 trace。本任务的选区同步限制下未更改该旧用例或产品路径。

### Modern Web Guidance

复用原生按钮的 Enter 和 Space 激活，按 `accessibility` 的 “Don't attach keyboard handlers to native interactive elements” 保留正常 Tab 导航。按 `form-factor-adaptation` 的 “Let components respond to their container” 使用详情浮层实际挂载状态与滚动容器位置决定留白。

## Lead 验收


（Lead 追加，2026-11-19）**验收：通过**。H03 的“粗体”气泡等待，正是 w4:pF 修复的聚焦选区竞态（77d5add），在集成候选上复核。
