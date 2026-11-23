# 05a748b6 Linux 候选包核查

Herdr Core 任务 `2026-11-21-huhu-issues-3-10-linux/t15w/task01.md`。Lead 为 t3p，终端 t15w 与 manifest 的 active 行相符。核查基线为 `05a748b61eaa6dddaaa86aa648a2e68dd385d085`，分组脚本使用的 AppImage SHA-256 为 `44eb01b894a4b81a17c27132b8aab29c98894f52340c5129036c1d5ae90c49d1`。

**Engine 的 profile 应通过启动它的 Electron Main、该 Main 登记的 Engine PID 和该 Vault 的就绪端点联合核对。模板派遣则应在 runNow 返回时已有确定的受理或跳过结果。** 现有两处失败需要不同的证据。

## 九组实际结果

| 分组 | 原运行结果 | 证据 |
|---|---|---|
| package、workspace | 5 例、1 例通过 | 各组日志第 116、113 行 |
| web、tools-web、rule、git | 各 1 例失败 | 各组日志第 115 行，均为 Engine profile 断言 |
| web-terminal | 3 例失败 | 日志第 117、145、173 行，同一断言 |
| tasks | 1 例失败 | 日志第 115–129 行，模板派遣实际为 `[]`。trace 已有此前原生任务回执附件 |
| native | 测试未启动 | 日志第 3 行，`realpath` 找不到 `native/agent-pty/bin/linux-fixture`。分组脚本第 17 行会复制当时已有的 test-results，native 附件目录里的 web-terminal 内容不能计入 native |

日志和附件位于相邻工作树 `../agent-linux/temp/final-audit/packaged-*`。Lead 补充已按同一 05a 源码构建 native 夹具，所报 SHA-256 为 `3dd50108787e9127cf0995b446debf4a875e914dd873f930b52b93c0d1c4a189`。本报告登记其来源，原日志没有重跑结果。

## Engine 身份与最小诊断

**日志已经证明什么。** `tests/e2e/helpers/candidate-desktop.ts:113–129,273–292` 先等桌面就绪，再校验本 Vault 描述中的 rootBinding、Vault ID 格式、端口、startedAt 类型及 Engine PID 的可执行文件路径。七例都已通过这些前置检查，随后第 127 行把「区别于 Main 的 PID」「userData 环境项匹配」「runtime 环境项匹配」合成一个布尔值。日志没有三个分项的观测值。renderer 的端点对照和完整的 confirmCandidate 还在后面。web 组的清理附件另记录了关闭前复核 Engine 和退出检查失败，不能据此断言有进程残留，也不能认定清理已通过。

**变量从哪里来。** helper 给 Main 的环境包含私有 XDG_RUNTIME_DIR，启动参数包含夹具的 --user-data-dir。生产 supervisor 在 fork 时继承环境，显式把 app.getPath("userData") 赋给 HUHU_DESKTOP_USER_DATA，并指定服务显示名 huhu-engine。Engine 从自身 process.env 取 userData 传进 boot，经自己的 parentPort 回报端口和 Vault ID。Main 只接受当前 child 的 ready 消息。见 `apps/desktop/src/main/engine-supervisor.ts:134–146,171–195`、`apps/engine/src/main.ts:65–98,112`。

**为什么 procfs 检查不足。** 锁定的 Electron 44.9.1 把非空 env 作为 Chromium ServiceProcessHost 的启动环境，普通脚本参数经 NodeService 初始化。Linux 的 /proc/PID/environ 读取 exec 时的原始环境内存区。该 Chromium 版本的 Linux 进程标题实现可复制环境字符串并清空、复用原 argv/env 区；此时 JS 仍可能读到两个正确值。源码足以说明该观察方式缺乏保证，历史日志尚不足以确定本次是否走过这段代码、是否只是其中一项失配、或 Main 实际选错了目录。直接假定 zygote 为父进程或要求 PPid 严格等于 Main PID 同样缺乏现场证据。[Electron 44.9.1 fork 实现](https://github.com/electron/electron/blob/v44.9.1/shell/browser/api/electron_api_utility_process.cc#L209-L220) · [捆绑的 Chromium 版本](https://github.com/electron/electron/blob/v44.9.1/DEPS#L3-L6) · [Linux procfs](https://man7.org/linux/man-pages/man5/proc_pid_environ.5.html) · [Chromium 原始环境区处理](https://github.com/chromium/chromium/blob/152.0.7977.167/base/process/set_process_title_linux.cc#L67-L97)

**建议 Lead 先运行的一次探针。** 任选一个共享 helper 失败用例，在 engineReady 后、首个断言前，于同一候选包和新建私有目录取一次快照。由 Playwright 已连上的 Main 执行 app.evaluate，仅返回以下字段。各项分别断言并标记失败项；无需打开任何进程的 environ。

1. Main 的 process.pid 与 app.process().pid 相同，app.getPath("userData") 与预期目录的规范路径相同，process.env.XDG_RUNTIME_DIR 与本夹具 runtime 相同。继续执行 confirmCandidate 的包 SHA、资源哈希、运行路径、版本、commit 与页面来源检查。
2. 用该 Main 的 app.getAppMetrics() **按描述中的 PID** 筛选，保留匹配行的 pid、type、name、serviceName、creationTime。要求它属于当前 Main、区别于 Main PID、类型为 Utility，显示名为 huhu-engine，并保留 /proc/PID/exe 指向同一份解包 huhu 的检查。Electron 把 fork 的 serviceName 传给 WithDisplayName；metrics 的 name 与 serviceName 是不同字段，应以显示名检查 huhu-engine。若该 PID 无匹配行或名称不同，输出允许字段并判失败。仅在确有指标发布时间差时，对同一 PID 做有界重读。[Electron 显示名传递](https://github.com/electron/electron/blob/v44.9.1/shell/browser/api/electron_api_utility_process.cc#L569-L581) · [进程指标字段](https://www.electronjs.org/docs/latest/api/structures/process-metric)
3. 在本夹具 Vault 的同机 engine.json 只投影原有身份字段。验证 rootBinding 命中夹具目录，描述的端口、Vault ID 与同一窗口 huhuHost.engine() 返回的 baseUrl、vaultId 一致。Engine 写入自身 PID 与实际监听端口的位置是 `apps/engine/src/boot.ts:631`。保留现有 startHash，复核时对比初次 PID、creationTime、描述与端点，能识别重启或 PID 复用。创建、业务前后和关闭前共用这套检查；保留关闭后 PID 退出、描述移除以及已启动 Core 的私有 runtime socket、二进制和退出核对。不得因首轮身份未成立而把未知 PID 当成已验证的清理目标。

该快照可以区分选错 profile、描述指向别的进程、以及关联错误的 Vault。如还须精确区分 Engine 是否收到生产 fork 传入的两个值，最小的定向诊断是在诊断构建的真实 Engine 启动点经现有父子通道回传两个路径的摘要和 PID，同次 Main 按预期摘要比对，或验证真实 Engine 创建在预期 userData/runtime 的夹具专属产物。诊断构建须标记独立 SHA；最终包身份验收仍使用原候选包快照。另起一个演示 utility 或事先向 Main 环境额外塞入 HUHU_DESKTOP_USER_DATA 均不能证明实际 Engine 的绑定。

## 模板派遣的返回契约

**第 423 行的读取时机符合基线契约。** 测试传了 expectedVersion 和固定 intentId。`plugins/automations/src/engine/index.ts:476–494,522` 等待 invokeWorkbench，随后以同一个 occurrence 查询 dispatches。`task-scan-occurrences.ts:115–152,300–321` 在首次受理前刷新检测、冻结模板，再等待创建任务、逐项受理和 finishedAt 持久化才返回。重复 intent 读取同一记录。受理之后的 Agent 执行、结果回执和 UI 可见性才需等待；第 427 行已有结果轮询。同类成功用例在第二次 runNow 后立即断言 accepted，预检失败用例同时断言 finishedAt、missing-space 和空 items。见 `plugins/automations/test/task-scan-occurrences.test.ts:777–796,865–876`。

**空数组的含义。** dispatches() 会过滤已跳过的 item；模板预检或任务创建失败也可以在完成时留下空 items。先取 runNow 的真实 summary，再从**本次私有可写 Vault** 的 `.huhu/automations/task-scan-occurrences/<activationId>.json` 仅提取 ruleId、id、finishedAt、tasksDisabled、template.issue 及 items 的 state/reason。避免保存模板正文或任何完整快照。合法的模板成功预期为 processed=1、skipped=0，加一条 accepted 且有 runId 的记录。若 processed=0、skipped=1，依据已落盘原因定位。若 processed=1 而同一发生查询仍为空，核对同一记录的 items 与查询映射并暴露为一致性问题。盲目轮询空数组只会延迟报告终态跳过。见 `task-scan-occurrences.ts:168–195,354–417`。

**最值得验证的原因是 cli-missing。** 前一段真实 Codex 成功执行说明受控派遣能使用 HUHU_CODEX_DISPATCH_BIN。模板预检另行要求 Space 存在且可达、正文非空，以及安装探测返回可执行且支持 headless 的 codex。该探测依次走设置中的 command、PATH 和固定安装目录；受控派遣变量只接到 native dispatch。验收脚本第 37 行收窄 PATH，提供的已校验 ELF 位于独立证据目录。当前主机对应 PATH 目录及 /snap/bin 下未见同名 codex；这只是当前旁证。历史 tasks 日志与 trace 没有记录此模板的跳过原因，前一个定时任务的回执也不含该模板的 occurrence。其他候选包括 Space 不可达、Tasks 服务不可用、创建或受理阶段拒绝。见 `apps/engine/src/boot.ts:302,450–468`、`plugins/automations/src/engine/service.ts:315–325`、`plugins/agent-cli/src/engine/detect.ts:136–170`。

建议在同一次模板探针中取 agent.catalog.detect 的 codex 行，只保存 installed、headless 及其 path 是否等于经 SHA 检查的 ELF。若落盘原因为 cli-missing，在**夹具**中将 Codex 的 command 配为同一个已核验的绝对路径，保留原受控派遣校验，确认 detector 和真实执行都指向该 ELF，然后由 Lead 重跑原用例。若为其他原因，沿落盘阶段核对 Space、插件状态或 Tasks 的拒绝原因。保留原 intent 重查、唯一派遣、唯一请求、结果及 UI 断言。

## 未运行的验证

本次完成源码、上游实现、既有日志和附件的只读分析。实际 Engine 的指标、两项运行时环境值、该模板的跳过原因，以及新 native 夹具的运行结果均待 Lead 对隔离候选包实测。未运行测试、构建、打包或全仓检查；唯一写入为本报告。
