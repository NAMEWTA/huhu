# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pA
- task：task02.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task02.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report02.md
- 执行结果：done

## 结论

复刻矩阵 82 行已给出逐行结论，77 行直接验证，5 行由 Huhu 等价物取代且已验证。补充的第 115 行亦通过。外部 Embed 能插入、编辑并持久化，关闭重开后仍显示未加载提示和原 URL。Electron 和独立 Chromium 都观察到外部请求数为零。

原斜杠菜单逐项用例四路并行跑 20 次，13 次通过、7 次失败。入口探针确认 Ctrl+A 后直接输入会保留引用块结构，快照也复现了下一轮斜杠仍位于代码块。新定向用例点选顶层段落后再触发菜单，四路共 20 次全部通过。既有逐项测试文件在本任务写入范围外，最终全量也执行了该用例。

最终提交的完整知识库 Electron 为 57 通过、1 默认跳过。大 Vault 用例另启开关通过。类型、lint、构建、格式、knip、补丁登记及两组完整 Vitest 门禁均通过，Vitest 最终重跑限制并发。

## 产物与改动

工作目录 `/home/wta/projects/huhu-wt-parity`，分支 `closeout/issue2-parity`。提交后工作树干净。

- `0c9705cb7758fe2adfd538f0da56b3bd950b03f0` 增加 Embed 离线提示、Vault 分段附件下载和文件树至 DocTab 的拖放。修复预览编辑模态的 CodeMirror 草稿重置，以及布尔属性开关未显示默认值。增加 9 个真实 Electron 用例。
- `6a19a4c83e3a49e2d6df67e376d318a4a6b54f22` 修订图片选区同步和格式提示定位。最终构建及整套门禁以此代码提交为依据。
- `e21203302cb03e8c48aa14498e2238baf172fb3e` 提交逐行矩阵和运行记录。[parity-82.md](/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/parity-82.md) · [runs.md](/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/runs.md)

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| B01 与 Embed | 82 行号与归档目标集合一致。图片三种对齐逐次关闭重开，11 MiB 附件下载校验名称与完整字节。Embed 更新 URL 和未改动的 Markdown 属性均保真。 | [逐行矩阵](/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/parity-82.md)，[Electron 用例](/home/wta/projects/huhu-wt-parity/tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts) |
| 斜杠菜单负载 | 原测试 13/20 通过。选区探针 6/8 通过，其中两次复现引用结构残留。顶层段落定向用例 20/20 通过，最终全量中原逐项用例也通过。 | [运行记录](/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/runs.md) |
| 知识库 Electron | 首轮 56 通过、1 失败、1 跳过。第二轮 55 通过、2 失败、1 跳过。图片和格式用例修订后各重跑三次通过。最终轮 57 通过、1 跳过，包含 H07 和 200 轮泄漏检查。大 Vault 另跑 1 通过。 | 本机 `/tmp/huhu-parity02-fLyyRi/` 中的 `final-e2e.log`、`final-e2e-serial.log`、`task02-fixture-repeats.log`、`delivery-e2e.log`、`task02-huge.log` |
| 类型、lint、构建、格式、knip、补丁登记 | 最终提交上均以退出码 0 完成。199 项补丁登记无缺漏、无多余项。 | [运行记录](/home/wta/projects/huhu-wt-parity/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/runs.md) |
| 根与上游单测 | 根 Vitest 859 通过、1 跳过。上游 Vitest 6,009 通过、4 跳过。限两个 worker 的完整重跑均退出 0。根并发首跑失败的 13 项过滤重跑三轮，每轮均通过。 | `delivery-test-retry.log`、`delivery-test-vendor-retry.log`、`delivery-root-failed-1.log` 至 `delivery-root-failed-3.log` |

## 阻碍与接续

- 任务门禁已通过。编辑区原生资源菜单和标签右键的入口缺口仍登记在矩阵。验收中的路径复制、资源打开、标签切换和关闭由 Huhu 的资源树及 DocTab 提供。目录导航从资源树操作。
- 原斜杠菜单逐项用例的复位仍依赖当前编辑上下文。若 Lead 接续该用例，可采用首次定位可辨识的顶层段落，或让每条命令在独立的初始文档运行。
- 既有紧凑评论用例首轮全量中提交后正文未出现，单独重跑三次为 2 通过、1 失败。独立失败当时只挂载了 28 个编辑器，最终全量通过。另一次观察中 HTML 代码预览 iframe 未呈现，代码预览模态的键盘编辑、保存及重开源码已通过。

## Lead 验收

（Lead 追加，2026-11-18）**验收：通过**。82 行全部有结论，Embed 离线提示也已验证。斜杠菜单偶发失败的根因是测试的复位方式（`Ctrl+A` 后直接输入会保留引用结构），不是产品缺陷。原用例在负载下只有 13/20 通过，会拖累后续门禁，由 task03 修正。
