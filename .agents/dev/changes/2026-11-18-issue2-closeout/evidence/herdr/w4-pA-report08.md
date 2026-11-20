# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pA
- task：task08.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task08.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report08.md
- 执行结果：done

## 结论

两项复审回归均在集成基线复现，修复后 Electron 定向验证通过。设置页保留的隐藏笔记收到 Ctrl/Mod+F 后无查找栏，返回活动笔记后可以按键打开、关闭查找栏，原有浮层优先级也通过验证。导入模板以一次 Vault 原子写入保存完整原字节。「新建笔记」对话框和文件树的「从模板新建」都可使用已导入的本地模板。编辑新笔记、保存、关闭并重开后，源文件和模板保持原字节。

## 产物与改动

- 工作目录 `/home/wta/projects/huhu-wt-parity`，分支 `closeout/issue2-parity`。开工合入 `closeout/issue2-integration` 的 `9b143a4`，合并提交 `6439a6a057cbaabc4705d816e341b10811daee70`。
- 业务提交 `4394d12ede0e0417d6d67db2232fab02bd8221f5`。查找快捷键在识别实际组合键后跳过无布局框或位于 inert 子树的编辑器。模板清单列出 Vault「模板」目录中的 Markdown，以相对路径区分同名项。文件树先收集最终名称再创建，避免用笔记改名流程生成文档。
- 格式化提交 `8849864`，仅将新增模板回归的定位语句按仓库格式分行。
- 验收证据提交及交付 HEAD 为 `6032ead6b06db05274919e0c0bf85bef8763fc55`。工作树无未提交改动。
- 已更新 vendor 的 `PATCHES.md` 和重放产物。验收记录在 `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/` 下的 `review-fixes.md`、`runs.md` 和 `endpoint-matrix.md`。

## 验证

日志及 Playwright 输出位于 `/tmp/huhu-parity08-po3ZrO/`。Electron 构建的 build-info 为 `4394d12`，后续只有测试格式调整和证据更新。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 设置页 Ctrl/Mod+F 红转绿 | 基线在设置语言选择框聚焦时按键，DOM 内出现 1 个查找栏。修后同路径计数为 0，返回笔记可以打开、关闭。可见编辑器的查找替换、普通键和浮层优先级也通过。四项定向 Electron 通过。 | `red.log`、`targeted.log` |
| 导入模板并用于两处新建红转绿 | 基线模板副本已原样落盘，真实新建对话框缺少「模板/样板.md」。修后对话框从模板创建、保存编辑、关闭及重开通过，文件树选择同一模板并输入最终名称后创建通过。模板与原件字节一致。 | `template-red-confirm.log`、`targeted.log` |
| 原子写入、重试和同名并行 | 专项 2 通过。首次完整写入模拟失败后无空文件，重试保留 BOM 与 CRLF，两个并行同名导入各获独立名称。 | `template-unit.log` |
| 独立浏览器快捷键 | Chromium 158.0.8127.18 通过隐藏保活和恢复显示的真实按键检查。 | `browser.log` |
| `node scripts/ok-patches.mjs --check` 和 `--replay` | 均退出 0。267 条登记无遗漏或多余，从固定上游重放 1,346 个文件，文件集合和字节零差异。 | `patches.log`、`replay.log` |
| `pnpm build` | 退出 0。 | `build.log` |
| `pnpm lint` | 退出 0。 | `lint-final.log` |
| `pnpm format:check` | 首跑发现新增测试一处需换行。修正后 688 文件通过，退出 0。 | `format-check-final.log`、`format-check-delivery.log` |
| `pnpm knip` | 退出 0。两条提示涉及编辑器既有依赖忽略配置。 | `knip-final.log` |
| `pnpm typecheck` | 全仓库通过，退出 0。 | `typecheck-final.log` |
| `pnpm test` | 重启后从头运行，85 文件通过、1 文件跳过，999 项通过、1 项跳过，退出 0。 | `test-final.log` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 默认 1 worker、0 重试，100 通过、1 跳过、1 失败，退出 126。两项新回归、原查找用例及 F10 的 200 轮均通过。唯一失败为 B01，在进入标签页菜单前的 5 秒内未出现「引擎就绪」。 | `knowledge.log`、`knowledge/knowledge-layout-tab-menu-*/trace.zip` |
| B01 复跑 | 保留首轮失败的 trace。同一构建、单 worker、零重试，独立运行连续 3 次通过，退出 0。 | `knowledge-failed-rerun.log` |
| `pnpm test:vendor` | 首跑 R13 依赖树扫描超过 120 秒，另有 worker 通信超时。全量复跑 330 文件通过、6,391 项通过、4 项跳过，依赖树扫描 16 秒通过，退出 0。 | `test-vendor-final.log`、`test-vendor-rerun.log`、`vendor-initial.json`、`vendor-rerun.json` |

## 阻碍与接续

两项目标回归和规定命令的执行、记录均已完成。知识库默认全量的原始退出状态仍为失败，B01 在同一构建独立连续三次通过。重启前中断的单测日志保留为 `test-interrupted.log`，以重启后完整结果为准。默认 `test-results/.last-run.json` 为旧记录，本次完整 Playwright 状态以日志目录内的 `knowledge/.last-run.json` 为准。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过（4394d12）**。全量结果以 Lead 在空闲机器上对最终候选的零重试运行为准。
