# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pB
- task：task02.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task02.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report02.md
- 执行结果：blocked

## 结论

H03 通过。交付构建实际扫描的白名单外英文标签由 28 个降到 0。新增断言核对了文件树及气泡按钮的中文读屏名称，英文 `accordion` 能筛出中文“折叠面板”。即时切换界面语言按 Lead 决定记为不适用。

G07 将非 Markdown 文件查看器及其 CodeMirror 依赖推迟到打开附件，将 OK 主题映射移到富文本和文件树的按需入口。工作台实际解析 JS 比 task01 少 892,703 B（22.9%），实载 CSS 少 6,328 B。收件箱在工作台之后未解析新 JS，打开首篇笔记后观测到富文本块。

两轮交错测量有 21 对和 20 对有效样本。工作台 p95 差值为 −1673.3、+1493.5 ms，在 rc.4 两轮自身 2110.6 ms 的波动内。收件箱 p95 增加 442.8、230.4 ms，超过 rc.4 自身 14.5 ms 的波动。独立收件箱探针测得 click 到 DOM 中位数由 18.5 变为 25.3 ms，候选入口、共享工作台和框架块的采样中位数为 11.1、2.5、2.9 ms。该探针未复现正式样本的尾部差值，剩余延迟无法可靠归到某个脚本。F09 与 task01 的 6 对诊断中，首篇笔记 p50 / p95 增加 3.3 / 16.2 ms。两轮正式样本相对 rc.4 仍慢。

全量 E2E 有 4 项失败。D01/D02、紧凑评论和 1 MiB 文档打开均有后来 3/3 通过的复跑记录。5,000 行实时预览输入 p95 在交付构建和 task01 构建上分别复跑三次，六次均超过 16 ms。任务要求验证全部通过，因此状态为 blocked。

## 产物与改动

工作目录 `/home/wta/projects/huhu-wt-layout`，分支 `closeout/issue2-layout`，工作区干净。交付业务构建为 `94e79ead5cabe63ae514c57df5916c9168799058`，证据与收件箱探针提交为 `5f71479ca315551de4ba12cae1074e480be620e8`。前序提交 `6f1023c6948bf735aaa973ae99cf5374ecbddd5d` 引入本地化和整体路由试验，`b12e156ca03affe0d0198e3d493432e6a0e277d7` 记录文件树路由试验。最终拆分范围为查看器及样式，附件和重开笔记两个回归用例各通过三次。

- [H03 扫描与语言判定](/home/wta/projects/huhu-wt-layout/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/h03-i18n.md)
- [G07 两轮分位数、原始样本和阶段归因](/home/wta/projects/huhu-wt-layout/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/g07-budget.md)
- [验证命令、失败用例日志与复跑](/home/wta/projects/huhu-wt-layout/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/runs.md)

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| H03 中文扫描与 vendor 登记 | 独立测试和全量 E2E 均通过，白名单外 0。vendor 登记 60 条，未登记与多余登记均为 0。 | `h03-i18n.md`、`h03-task02-zh-hans.json`、`task02-tooling.txt` |
| G07 首屏实际资产与阶段耗时 | CDP 捕获实际脚本及体积、首屏样式表、Electron ready-to-show 和渲染标记。非知识库编辑器命名块探针通过。 | `g07-budget.md` 链接的阶段和模块原始记录 |
| G07 两轮交错复测 | 工作台在 rc.4 波动内。收件箱尾部差值超出波动。 | `g07-budget.md` 链接的 41 对样本与收件箱探针 |
| `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm format:check`、`pnpm knip` | 均已取得退出 0。 | `runs.md`、`task02-tooling.txt` |
| `pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check` | 均已取得退出 0，单元 852 通过、1 跳过，vendor 4173 通过、2 跳过。vendor 首次与单元并跑时发生 Vitest RPC 超时，独立复跑通过。 | `runs.md`、`task02-tooling.txt` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/a11y.spec.ts tests/e2e/perf.spec.ts` | 48 通过、4 失败、1 默认跳过。F08、200 轮泄漏、附件和完整用户路径通过。绝对冷启动为 1638 ms，低于 3000 ms 门槛。5,000 行输入交付复跑为 18.7、17.0、22.3 ms。task01 为 58.0、50.0、22.3 ms。 | `task02-e2e-final.txt`、`task02-e2e-idle.txt`、`task02-perf-baseline.txt` |

## 阻碍与接续

5,000 行输入延迟的 16 ms 门槛持续失败，task01 同一用例也未通过。继续验收需要编辑器性能负责人复核输入路径和探针采样，涉及本任务保护范围内的桥接和编辑器实现。收件箱若仍以 p95 作为发布门槛，需要在可复现尾部样本的环境中采集同一次点击的驱动、渲染及主线程跟踪。原始样本与复跑命令均已提交。

## Lead 验收


（Lead 追加，2026-11-18）**验收：H03 通过；G07 判为满足，但要在空闲环境复测**。依据：已证实编辑器只在进入知识库后按需加载；工作台 p95 的差值落在 rc.4 自身两轮的波动内；收件箱在低负载探针中位数只多 6.8 ms（不到一帧），正式样本里的尾部差值是在负载 12–16 下测得的。G07 按 Q9 是记录项。5000 行输入 p95 超标的问题同样出现在 task01 构建上，而且是在多个 worktree 并行跑 e2e 的高负载下测得；Lead 会在集成后、机器空闲时，对 main 与候选版本做严格性能对照，再决定是否需要修复。
