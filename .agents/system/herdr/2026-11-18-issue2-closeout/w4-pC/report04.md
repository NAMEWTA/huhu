# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pC
- task：task04.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task04.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report04.md
- 执行结果：done

## 结论

属性断言误把上一份快照的「已保存」当作本次键入已落盘。受控慢桥三次都观察到编辑区已显示新正文、源缓冲和磁盘仍旧、带新正文的写请求尚未发出。原自动保存随后写全。在这段窗口提交属性，另外三次都在同一次写入中保留新属性和末字，未观察到 C04 覆盖。同一原用例在四路 CPU 竞争下，任务分支通过 20/20，main 9f870c0 通过 9/10。main 的一次失败与 task03 在同一读盘断言出现，表现相同。现在用例先等待本次修改对应的精确文件字节，再核对保存状态，并单独覆盖慢桥上的属性合并。

D01 的旧驱动在刚重开、笔记还未加载时读取详情栏可见性，先得到 false，随后点击已保持打开状态的按钮，反而关闭详情栏。受控暂停笔记读取三次验证了这一状态转换。现有按钮公布 aria-expanded，驱动等待新文档工具栏就绪后按状态打开，再进入批注页。D01 明确覆盖关闭笔记前详情栏已打开的情况。

## 产物与改动

- 工作目录 /home/wta/projects/huhu-wt-session，分支 closeout/issue2-session，提交 b8df90fe6bdc4cf016e554b655ac0649bb59a0e6。工作区干净。
- 两项根因、验证记录及探针位置见 .agents/dev/changes/2026-11-18-issue2-closeout/evidence/session/review-fixes.md 和 runs.md。原始日志、临时探针代码及失败 trace 位于 /tmp/huhu-session-04/。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 原属性压力与主分支对照 | 相同测试 blob、单 worker 与四路 CPU 工作进程。b147410 失败 0/20，9f870c0 失败 1/10。后者同样在本次写入前读取旧正文。改后压力复跑 10/10。 | old-branch.log、old-main.log、updated.log |
| 属性与 D01 根因 | 慢桥自动保存探针 3/3，属性、合并及重开探针共 9/9。集成 03dc93b 的 D01 原用例无拦截复跑 3/3，历史超时由 trace 和受控状态转换解释。 | timed.log、probe.log、old-comments.log、review-fixes.md |
| 最终定向 Electron | 两个 spec 共 4/4，包含精确字节检查、C04 慢桥交错、坏 YAML 和 D01 的关闭重开、移动及恢复。全量中同四条均通过。 | targeted.log、full.log |
| 标准检查 | pnpm typecheck、pnpm lint、pnpm test、pnpm build、pnpm format:check、pnpm knip 均退出 0。单测 996 通过、1 跳过。 | checks、test.log |
| 全量 Electron | 144 通过、2 失败、1 默认跳过。失败均为 w4:pA 已知定位问题，分别等待英文 Embed 选项和 underline 按钮超时。跳过项为默认关闭的十万文件 Vault。 | full.log、full-results/.last-run.json |

## 阻碍与接续

本任务两项修复均已验证。全量仍有两个已分配给 w4:pA 的英文定位失败，随该分支修复集成后再复核。负载样本用于定位和对照，未用于估计更低概率的失败率。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过**。两项都有根因证据（测试读到了上一份快照的“已保存”、详情栏状态竞态），C04 交错有慢桥证据，没有数据覆盖。后续：完整旅程用例里“切回后尾字未落盘”的症状相似，转 task05。
