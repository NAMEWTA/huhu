# t15s/task01 固定候选启动和退出诊断

Lead t3p，执行终端 t15s。派工位于 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t15s/task01.md。以下路径相对 agent-linux 工作树。核对的 HEAD 为 `05a748b61eaa6dddaaa86aa648a2e68dd385d085`。

**两次启动失败都发生在业务操作之前，现有证据无法判定同因。另有一次独立退出超时已经定位到 Playwright 的 Close context 调用。** H05 撤销、TB-15 多窗退出接管的业务结果在对应失败轮均未得到验证。下一次最有区分力的证据是同一次启动中的主窗口导航、Engine 就绪和前一 Electron 进程退出时间。

## 失败现场

| 用例 | 最后已知状态 | 可据以判断的边界 |
| --- | --- | --- |
| Notes 第 29 项 | `temp/final-audit/targeted-notes-05a748b6.log:136–150,166–181`。上项顶层重载通过。本项等待 20 秒，定位器报找不到元素，总用时 36.2 秒。第 30–32 项通过，整组 31 过、1 败。 | `tests/e2e/knowledge/session-flush.spec.ts:1207–1217,1243–1244`。首窗已返回，临时 Vault 已写入样本，未进入第二窗口创建或 quit。原始 JSON 的第 1064–1070、1088–1103、1133 行记录 worker 0、retry 0、空的用例 stdout/stderr、仅指向共享结果目录的附件路径，后项转为 worker 1。Notes trace 未保全，无从还原当时页面。 |
| H05 第 4 项 | `temp/final-audit/failed-artifacts-05a748b6/knowledge-compact-submit-H05-撤销到空，点击发表不提交评论/trace.zip` 内 `test.trace:4–9`。launch 用时约 586 ms，窗口事件约 42 ms，随后等 engine-state，未记录该断言返回。error-context.md:12–16 只记录用例总超时 60 秒。归档仅有 runner trace、源码和错误附件。 | `tests/e2e/knowledge/compact-submit.spec.ts:97–113`。未到创建任务、输入、撤销或发表。单靠 trace 无法判断页面是空白、恢复页、renderer 已退出，还是驱动连接不响应；也没有 close 调用开始的记录。 |
| H05 的 worker | `temp/final-audit/targeted-failed-05a748b6.log:109–124`。第 1–3 项通过，第 4 项超时，随后**单独**报 worker teardown 60 秒超时并列出同一 worker 的四项。新 worker 的第 5–9 项通过，其中第 5 项是“删除到空”。 | 切换 worker 同时换了进程、profile、应用实例和用例。后续通过不能补证第 4 项，也不能单因归责于 profile。Lead 03:24 左右看到 PID 11791 及 GPU、网络子进程，瞬时未见 renderer，内存 available 约 26 GiB。原测试根下 `tmp/huhu-ud-4157991/SingletonLock` 当时仍指向 `wta-ubuntu-11791`，将观测的 PID 与特定 worker profile 对上。锁链接可以残留，缺少每次 launch 的 PID/exit 时序，无法把该进程归给前三项或定为 renderer crash。 |
| 千行任务滚动，第 16 项 | `temp/final-audit/targeted-failed-05a748b6.log:137–142`。1001 行、0 次超过 66 ms，随后用例超时，再报该 worker 清理超时；这个 worker 仅跑这一项。归档 `temp/final-audit/failed-artifacts-05a748b6/perf-任务列表-1-000-行滚动：没有超过-50-ms-的长任务/trace.zip` 内 `test.trace:20–28`，滚动探针和严格阈值断言均返回，约在用例开始后 5.8 秒进入 `perf.spec.ts:240` 的 Close context，余下约 54 秒未返回。 | 可以确认卡在 app.close() 调用层。没有 before-quit、flush、Engine stop 的运行日志，仍不能定位哪一层等待。Lead 此时段看到另一个 profile（huhu-ud-284724）的 Engine utility PID 286891 约 98% CPU；第 13–15 项的性能失败和 03:26:59 的 8 核负载 12.42/9.41/6.23 都缺少与两次启动超时时间对齐的调用证据。 |

Notes 原始 JSON 位于 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/targeted-notes-05a748b61eaa6dddaaa86aa648a2e68dd385d085.kmitLe/result.json`。H05 归档 SHA-256 为 `9833dcd3bd7fa2fcb5b3b90b730f30c6ddda49e04015a16ea668ed673d46e2ed`，千行归档为 `d83989bc2a9fefc054d9818d1c4bde64c2991107cec8bf0f43fe607eff571d3e`。两份运行日志里的 GTK portal 显示告警也出现在成功用例之前，所查材料未保留可归属到失败窗口的 Electron 启动 stderr。

## 代码能解释哪些现象

- **窗口返回与工作台可用分属两步。** 本机 Playwright 1.65.0 的 `playwright-core/lib/coreBundle.js:65618–65629` 在收到 page 时发送 window 事件。`tests/e2e/helpers/launch.ts:19–33,38–39` 每次创建独立 Vault，同一 worker PID 的启动共享 userData。H05 已返回该次 launch 的首窗；单实例拿锁失败直接 quit 的路径（`apps/desktop/src/main/index.ts:284–296`）与此不吻合。两次失败都尚未执行自身的慢桥修改；后者绑定已挂载的编辑器文档，见 `tests/e2e/knowledge/session-slow-bridge.ts:9–32,42–44`。
- **找不到状态标签有一条可直接区分的产品路径。** `apps/desktop/src/renderer/main.tsx:403–422` 在 vault.state() 完成前显示“正在读取 Vault…”，失败可显示“无法读取 Vault 状态”或启动页；打开后才有 AppShell 的 engine-state（`packages/workbench/src/shell/AppShell.tsx:285–290`）。`apps/desktop/src/main/index.ts:335–354,383–386` 让该 IPC 等待启动 Vault；Engine 的 ready/exit 和 60 秒启动期限见 `apps/desktop/src/main/engine-supervisor.ts:192–220`。即便 renderer 能响应，也可能在 Notes 的 20 秒窗口内一直没有标签。另一条候选是主框架加载失败或 renderer 退出后转恢复页，见 `apps/desktop/src/main/index.ts:262–280`。两例均缺当时主框架 URL 分类、页面阶段、Engine 子进程状态。
- **关闭有多个等待点。** helper 会依次 unrouteAll、app.close，再删 Vault；前三项通过说明其 finally 已返回。Playwright 的 `coreBundle.js:53767–53788,46021–46028,65637–65644` 表明 context 关闭会先收 trace/录屏，再调原生 app.quit 并等待 close。`playwright/lib/worker/workerProcessEntry.js:1412–1428` 的 worker 收尾还会关闭 fixture 和遗留进程。产品收到 before-quit 后要等各窗 flush，再进入 engine.stop；失联时可能显示等待用户选择的原生对话框（`apps/desktop/src/main/index.ts:90–103,147–172,601–636`）。这些步骤都可解释部分现象；第 16 项也未记录是否实际进入了原生 quit。承接第 4 项启动失败的 worker 收尾超时本身不标明具体资源。
- **千行写入有具体的同步重复工作。** `tests/e2e/perf.spec.ts:199–205` 运行时直接写 1000 个同目录文件，随后等首行显示。Watcher 按批提交变更，Engine 同步执行 index.applyChanges，再按文件发布事件（`packages/vault/src/watch/watcher.ts:121–146,211`、`apps/engine/src/boot.ts:596–605`）。`packages/vault/src/index/vault-index.ts:178–196` 对每个非删除项重新调用父目录的 takeSnapshot；`packages/vault/src/watch/snapshot.ts:24–29,37–50` 在每次调用中递归 readdirSync、逐文件 statSync。同目录 1000 个创建项若均在约 1000 文件落盘后处理，一轮可能达约百万次文件 stat。该静态成本能解释高 CPU，也可能延迟 Engine 消费 shutdown 消息。实际批量、耗时和 CPU 栈未知。普通 tasks.list 同样读取列表（`plugins/tasks/src/engine/service.ts:192–196`），此次调用次数没有记录。
- Engine 的 shutdown 收信和执行见 `apps/engine/src/main.ts:75–85,116–125`，顺序为 watcher.close、plugins.disposeAll、webShare.stop、server.close、vault.close（`apps/engine/src/boot.ts:644–662`）。Watcher 关闭会取消待执行计时器，再等订阅刷新与退订（`packages/vault/src/watch/watcher.ts:225–231`）；插件按逆序逐个停用（`packages/kernel/src/plugin-manager.ts:225–227`）。主进程对已进入的 Engine stop 有 15 秒超时，见 `apps/desktop/src/main/engine-supervisor.ts:264–281`。单凭忙碌的 Engine，解释不了整个 Close context 约 54 秒未返回，需先证明 stop 已进入。

## 建议由 Lead 串行取得的最小证据

1. **先保存单例结果，再对照前序。** 采用已排队的 Notes 单例运行；若单例通过且整组问题仍待归因，按原顺序同一 worker 跑 Notes 的 `:1167 → :1206`。H05 独立跑 `:97`，再用同一 worker 按日志 109–112 行重放原四项。固定候选、原 Xvfb/D-Bus、单 worker、零重试、临时 HOME/Vault。每轮给 Playwright 独立输出目录，随轮保存 JSON、trace、error-context 和脱敏事件日志。两组对照出现差异后再只变一个条件，如为跨用例分配不同 profile，同时保留单个用例内 relaunch 的共享语义。
2. **在首窗前后打时间点。** 从 main 的 createWindow/loadURL 之前记录本次 launch 标识、PID、顶层导航起止、加载错误码、render-process-gone 的 reason/exitCode、preload-error；EngineSupervisor 记录 fork/ready/exit 及 vault.state 请求/返回。helper 在 launch 前记录 worker/test 标识，返回后记录实际子 PID，监听退出与脱敏 stderr；首窗返回后收集 pageerror/crash/close。每次事件立刻写入测试专属文件，即使驱动失联也可取证。只记 URL 类型、错误码和耗时，不落 Vault 内容、token 或完整 endpoint。
3. **保留 engineReady 原断言，给它加前置分流。** 在 `launch.ts:23` 后及 `session-slow-bridge.ts:42` 前做有独立短期限的主进程和 renderer 响应探针。分别记录主窗 webContents ID/renderer PID、URL 类型、主框架是否完成导航，页面是否能读到 readyState、preload、Vault 加载/错误/启动页或工作台标识。两路独立发起并记录超时，避免 renderer 挂起同时遮住主进程证据。只在预期工作台仍未就绪时附上阶段记录；保留原失败与业务断言。
4. **把关闭时间线与前一 PID 对齐。** 记录 unroute 开始/结束、app.close 进入/返回、main before-quit、每窗 flush 请求/进度/回执/恢复对话框、engine.stop 进入、子进程收到 shutdown、各清理阶段起止、子进程退出、Electron exit。用同一条时间轴判断延迟落在驱动、保存确认、Engine 或退出事件。千行另记 watcher 批大小、父目录快照调用数、索引批耗时；若运行时造数才有热点，再用启动前预置等量任务作对照，保留原滚动阈值。是否修改索引或测试夹具，待计数和时间线确定。

**未运行的验证**：本次仅核对已有文件、归档和静态实现。未运行 E2E、单元测试、全仓检查、构建或打包；未连接测试浏览器、操作进程或访问用户 Vault。单项复现及修复验证由 Lead 的队列另行记录。

## Lead 验收
已读取并接受只读定位报告；区分启动与退出故障，未把静态热点推测当作根因。Notes 单例 t15r 后续通过，原偶发启动问题未关闭。报告投递权限提示不影响已产出的报告。
