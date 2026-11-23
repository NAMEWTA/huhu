# #7 H5.4 · SSH 本机 PTY 的归属与回收设计

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t5h`，本机 `wta-ubuntu` 默认 Core，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report01.md`
- 执行结果 — **done（只读设计）**。H5.4 的 A17 尚待实现和实机验收。
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`，`impl/huhu-issues-3-10-integration`，检查提交 `96b22c0aac0332372db9dd52a9fe1136b86056d0`。已核对 topic、当前指针和已验收的 t4k、t4t 报告。

## 判定与落地顺序

先修三平台共同的 Core、holder 和启动请求对账，再在 Linux 实现每次 Shell 专属的 systemd 用户 scope。Windows 原生 Shell 先验证随包 Job Object，按结果决定是否收紧 Job。macOS 和 WSL 来宾各自保留独立验收项。**只完成第一项，仍会留下 Unix 上已离开 PTY 的监听进程。** 关闭视图继续只释放连接，显式关闭 Shell、停用插件及关闭 Vault 才启动相应回收。

| 依据 | 检查结果 |
| --- | --- |
| Huhu 集成树 | `apps/engine/src/boot.ts:475` 按写者、目录实例和 SSH 专属 session/runtime/socket 注入。此提交的 `packages/herdr-client/src/herdr-core.ts:39` 已为 Unix SSH socket 建立、校验用户私有目录，覆盖共享临时目录回退。t4t 审查时的目录问题已有修复。端点保护本身仍不记录当前运行的身份。 |
| 发行合同 | `scripts/herdr.lock.json` 与随包 Linux x64 `herdr-core --version` 均为 0.1.19，编排用 `hc` 为 0.1.21。本机参考 `/home/wta/projects/huhu/temp/sources/herdr-core` 为浅检出 `ce81486e3d4032405060bb823687376fadaa087b`，含 Unreleased 条目。其 `schema/released.openrpc.json` 声明 0.1.19。`terminal.run` 有 labels、keep 和父子终端选项，`terminal.kill/rm` 按地址，`server.stop` 无参数。没有每个 PTY 的后代清理模式或按 run ID 幂等创建。父子终端选项管理 Herdr 终端之间的关系。 |
| Unix 和 Windows 的发行差异 | 上游 `CHANGELOG.md` 的 0.1.19 条目明示 Unix 正常关闭允许主动脱离的作业存活。参考 `holder.rs:292` 的 Shutdown 结束尚活的主程序和前台作业，可处理晚完成的 spawn。`runtime.rs:294,945` 有接回旧 holder 和停止整个私有 Core 的路径。`sweep.rs:1,74` 的继承 token 清扫用于异常丢失，主动脱离且丢弃环境可能无法定位。主动制造 holder 崩溃也不能履行 A17。Windows 发行说明明确描述 Job 清理，详细 flags 与限制见下。 |
| Huhu 和参考项目的可复用部分 | `plugins/agent-cli/src/engine/sessions.ts` 已有启动结果未知和按标签核对；`protected-launch.ts` 有一次性票据、撤销和宿主握手，helper 的 Unix stdio 有管道及脱敏，直接用于交互 Shell 会改变 TTY。`plugins/versioning/src/engine/git.ts:46` 用私有进程组处理 Git 传输。Motty `internal/localshell/backend_unix.go` 的关闭指向直接子进程。这两条路径都没有对换 session 的孤儿保持所有权。Windows 可复用 `native/agent-pty/console_windows.go` 的原子入 Job 做法。 |

## 第一项 · 在窗口退出预算内核对已拥有的运行

**先证明谁有清理权。** 只允许持有当前 Vault 写锁的 Engine 建立或恢复 SSH 所有者。沿用 `packages/vault/src/identity.ts` 的目录实例绑定，加上 machineId、OS 用户、插件名、私有 session、端点和状态目录。为每次启用生成随机代号，先在受保护的本机运行目录原子写入清单，再启动私有 Core。新代使用独立短端点和状态子目录，旧代留到回收完成，防止迟到的 start/stop 作用到新代。清单跨 Engine 复启可读，权限限当前用户，校验格式与路径且拒绝符号链接，按写者串行更新。清单只存归属、启动阶段和运行证据。复制 Vault 连同清单后，目录实例不匹配，副本不能照搬停止权。仅有路径回退、目录原址已替换且缺乏独立本机凭据时，旧代转为待核对。只读 Vault 不启动、接管、写清单或停止写者资源。同机 Agent 沿用自己的端点与生命周期。

**先记意图，再发 RPC。** 每次 open 在 ensure 前分配 run UUID，记录 preparing；创建成功先读同一连接的 `server.status`，持久化 `core.id,pid` 和 `holders[].{instance,pid,current}`，含排空中的 holder。Core ID 可从状态文件跨重启复用（上游 `server.rs:136`）。进程出生身份须补 OS 启动代与创建时间；运行时能持有则保存内核进程引用，复启后重新核对。发送 `terminal.run` 前记录可能已发，沿用 `huhu.ssh-local=<run UUID>`，补所有者代标签；收到回复后记录本地 address、更新 holder 快照。更新或新建 holder 后再次抓取。关闭请求和重试共用同一个清单条目，永不重发结果未知的 run。对无新清单的旧版：仅可从已验证的原 SSH 私有端点、写者身份、原状态目录与确切 SSH 标签建立迁移证据。无明确归属的实例保留诊断；遗留 Unix 脱离作业无法靠新清单追认。

| 事件 | 操作、完成条件 |
| --- | --- |
| 正常关闭单个 Shell | 先撤销该 run 的启动许可并关闭相应视图输入；用私有连接核对代、标签、本地地址；live 执行 kill，finished 执行 rm，再查精确标签。自然退出与 framed 传输断线分开处理。即使视图已 ended，仍完成清单中的回收。同一 Core 上其它 SSH Shell 及 holder 继续工作。若方案二已启用，关联 scope/Job 也须为空。 |
| 在途或丢失回复 | 发现、ensure、connect、run、framed hello/attach 都受取消与共同截止时间约束。断开已坏 client，使用只连旧端点的新连接查 `terminal.list({all:true,labels})`，客户端再逐项核对本地地址、两项标签与 Core 身份。kill/rm 回复丢失用同一规则重查。list 失败或 run 可能仍在服务端排队时，一次空列表不能证明未创建；保持 pending，迟到结果交回同一回收器。单个 Shell 请求不得停止仍有兄弟 Shell 的 Core。 |
| 整个作用域关闭 | 同步封住新 open 和所有晚到的 attach；abort 启动信号，另建仍可用的清理信号。对已登记 run 并发、限量补偿，刷新所有 holder。确认整代专用且没有冲突归属后，在已核对身份的同一连接发 `server.stop`，使服务端拒绝后续创建并处理在途运行。避免 CLI 按可变化端点重连。停后复核旧 Core 和各 holder 的出生实例已退出、该代端点无法再服务且无在途 starter；有握手的运行也要核实已结束。套接字消失、CLI 返回零或 UI ended 单项均不足。发现陌生终端、端点更换等不一致，停止个别精确匹配项，保留整代冲突，不扩大清理。 |
| Engine 崩溃后重启 | 写者取得锁后、接受新 open 前按清单对账；即使 SSH 插件保持停用，也须由写者启动路径处理未完成回收。若只有旧 holder 幸存，可在确认独占的旧状态与旧端点上限时启动同一随包 Core，复用上游接回 holder 的机制。检查接回的实例、标签及旧记录，再关闭这代；恢复路径禁止运行任何用户命令。仅列环境、只读访问、无旧意图都不触发启动。无响应、权限不足、已知实例仍活或 starter 可能晚到，持久化“结果待核对”，不向 UI 报清理成功。 |
| 进程重用及重试 | 信号只交由已绑定的协议连接或 OS 稳定对象执行。Linux 若要做无 RPC 的进程级补偿，应先打开 pidfd，再对仍活的同一实例核对 boot ID、PID namespace、出生 tick 与可认证的 Core/holder 身份，持有该 fd 操作；Windows 用带创建时间的进程 HANDLE。仅凭 PID 或两次按 PID 查询不授权发信号。macOS 缺少已验证的同等句柄路径时只用已核对的 Core 协议，记录未确认实例。启动时身份无法建立、PID 命名空间不同或 pidfd 不可用时走待核对分支。 |

**15 秒从窗口发出 shutdown 算起。** Main 的 `engine-supervisor.ts:261` 和 Engine 的 `main.ts:116` 各有 15 秒时限；`boot.ts:633` 先等 watcher，`plugin-manager.ts:194` 串行停插件，不能给 SSH disposer 另起一轮 15 秒。建议 Main 把外层截止时刻随 IPC 传递，Engine 接收后用单调时钟跟踪剩余预算，启动期间收到也保留原期限。关窗一开始就封住 SSH 启动并启动幂等回收，插件 disposer 随后等待同一 Promise。初定从窗口起算 0–2 秒撤销并对账、2–8 秒并行清终端及请求 Core 停止、8–12 秒核对 OS 对象和处理已证实的残留；预留 3 秒给其它关闭工作。阶段可提早推进，各次调用只取剩余时间。手工停用也沿用相同的有界操作。必须实际销毁卡住的 socket、解除 listener、停止自有启动客户端、处理迟到完成，单纯 Promise.race 会留下生产者。服务管理器可能在启动客户端退出后继续已接单的 job，须纳入核对。遇宿主挂起，预算内返回“未确认”并保留清单，下次写者继续；不能承诺在断电、内核不可中断等待或管理器失联时 15 秒内消灭所有进程。

**最小拟改范围。** 在 `packages/herdr-client/src/{client,herdr-core}.ts` 增加可选截止时间、可取消的连接/调用和对指定私有实例的状态、停止及复核；保持 Agent 默认行为。`plugins/ssh/src/engine/{local-pty-herdr,local-shell,index}.ts` 贯通 run 意图、单次关闭和失败传播；一个 SSH 宿主模块集中管理代、清单和恢复。`apps/engine/src/{boot,main}.ts` 和 `apps/desktop/src/main/engine-supervisor.ts` 传递关闭预算并在插件启用前安排旧代回收。沿用 Vault 写锁和现有原子写入模式。上游 RPC、UI 和 Agent 插件均无需先行变更。

## 第二项 · 在用户 Shell 执行前建立后代归属

**Linux 首选每个 run 一个 systemd 用户 scope。** 将受信任的绝对路径 `systemd-run --user --scope --quiet --unit=<一次性名称> … -- <启动门控程序> <原 argv>` 放在 Herdr 的 **terminal.run 的 argv**。通过当前用户管理器创建临时 scope，使用 `KillMode=control-group`、有界停止等待及最终 KILL，要求实际读回属性。门控程序继承原 cwd、环境、stdio 和控制终端；核对自身 cgroup 与管理器报告的 ControlGroup 一致，取得管理器的 InvocationID。Engine 在放行前查验 UID/boot、单次名称、scope 类型、InvocationID、ControlGroup 和本次票据，持久化后才允许门控程序原位 exec 所选绝对路径及原始参数。可复用 ProtectedLaunch 的票据机制；门控不得代理 Shell I/O。固定 argv 传递，禁用参数变量展开或做版本能力检查。独立门控也可用很小的固定 sh 入口先同步调用受信任的验证 helper，再执行 exec，需用真实 PTY 验证前台组、作业控制和信号。握手超时、票据撤销或写清单失败，门控退出，用户 Shell 尚未运行。系统管理器的 scope 可在 Engine 和 Shell 退出后持续代表存活成员。[systemd 对控制组与委派的说明](https://systemd.io/CGROUP_DELEGATION/)；本机手册 `systemd-run(1)`、`systemd.scope(5)`、`systemd.kill(5)`。

- **为何放在此处。** Electron 用 `utilityProcess.fork` 启动 Engine，Engine 用 `server start` 拉起 Core。参考 Herdr `platform/systemd.rs:58,96,239` 会为 Core、holder 分别建立随机用户 service，采用 `KillMode=process`；自定义 XDG runtime 或用户管理器不在时存在直接启动分支。给 Electron、Engine 或 `server start` 包一个 scope 无法证明用户 Shell 在其中。一个 holder 可服务多个 run，停止整套 holder service 也无法实现单 Shell 关闭。
- **关闭和复启。** 在关闭、自然退出、丢失 run 回复或崩溃重启时，用同一条清单收回精确 scope。生成随机全名且永不复用；创建遇同名即失败。持有管理器 unit 引用（支持时用 RefUnit）并核对 InvocationID/ControlGroup，防止并发卸载和应用重建同名对象。只向用户管理器发该 unit 的停止请求，两次关闭共用同一结果；等待 job 完成且原 cgroup 的 `cgroup.events` 为 `populated 0`，或经核实原组已移除。权限错误与已移除必须区分。提交前崩溃的空 scope 由无票据门控自行退出，旧记录仍待核对；提交后崩溃的 scope 即使只剩孤儿也可重找。若发现同名异代，不能按名称停。对同 UID 主动伪造/迁移 unit 的对手，此管理器接口不提供事务型身份鉴权；该情形不作隔离保证。
- **能证明的后代。** cgroup 成员在 fork 时继承组。普通双 fork、离开控制终端、PARENT 退出或清空环境都不改变成员资格。由管理器按组终止可避免逐个 PID 的重用竞态。只操作本 run 私有组。共享 holder、Agent、同名 Vault、兄弟 Shell、由独立服务管理器另行启动的进程均不能按 PPID、环境、命令名或端口一并结束。主动跨 cgroup 迁移、调用外部常驻 broker 另起服务都超出原组证据。端口可作测试结果，不能授予停止权。[Linux 内核 cgroup v2 文档](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- **本机实据及回退。** `wta-ubuntu` 为 Linux 7.0.0-43-generic x86_64，UID 1000，systemd 259.5，具备 `systemd-run`、`systemctl`、`busctl`。当前进程的 `/proc/self/cgroup` 位于 `user@1000.service/app.slice/hc-hold-….service`，相应 cgroup 有 `cgroup.events`、`cgroup.kill`；本人进程 pidfd_open 成功。运行目录 0700，用户 bus 和 systemd/private 两个 socket 均存在。本工作沙箱中 cgroup2 只读，`systemctl --user show` 返回 EPERM。这证明宿主具备管理器布局和工具；创建 scope 的授权、退出时延及从**实际打包桌面**继承的用户 bus 仍需实测。不要直接写桌面/holder 所在 cgroup；直接使用内核接口需要明确委派的专属子树。无管理器、缺工具、旧版本、无 bus 或访问被拒时，只执行第一项已证实的回收。若入口宣称符合完整 A17，应在启动前明确返回“本机缺少受管进程组”并保留原可选环境身份。若产品保留普通 PTY 模式，应明确其仅能回收终端及前台进程，并把 A17 标为未覆盖。
- **Windows。** 先在原生 PowerShell/cmd 用真实 0.1.19 验证普通后代随 holder Job 关闭。参考 `platform/windows.rs:962,1017` 设置 KILL_ON_JOB_CLOSE 及 BREAKAWAY_OK，并在恢复挂起主线程前尝试 AssignProcessToJobObject，参考代码未检查该赋值结果。对普通进程有效的发行语义不构成“任何启动都原子入组”的证据。严格模式优先在 holder 的本 run 创建路径复用 Huhu `native/agent-pty/console_windows.go:newJob/startInner` 的不可 breakaway Job、创建时 JOB_LIST 属性和挂起后校验再放行，控制句柄不让子程序继承，按句柄终止或由最后句柄关闭清理，验 ActiveProcesses 为零。保持同一个 ConPTY 与交互路径；若走上游 opt-in，则等实际含开关的锁版及架构包后采用。原生 fixture 还需覆盖嵌套 Job 约束、分配失败、句柄泄漏和同用户/SYSTEM 管道 ACL。WSL 单列：Windows Job 只证明 Windows 客户端归属；要承诺来宾内后台服务退出，需要在所选发行版内提供能验证的 per-run 管理（如可用的来宾用户 scope）并核对来宾 PID/端口。禁止终止整个共享发行版。[Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- **macOS。** 第一项仍可独立实现。桌面上游 `platform/macos_launchd.rs` 用 launchd 启动 Core，也允许直接启动回退；launchd 作业标签或 POSIX 进程组无法证明任意交互命令双 fork、换 session 后的归属。Herdr 的异常 token 路径还依赖可读、继承的环境，用户态树快照存在父进程提前退出及 PID 重用窗口。对产品自己显式创建并登记的后台作业，可按专属受管作业或有确认握手的控制连接收回；本次未找到已发行且能涵盖“任意 Shell、环境已清空、已脱离”的无特权能力。严格入口走与 Linux 能力缺失相同的处理，保留普通终端模式的覆盖限制；如后续选用上游局部清理开关，仍须核实它采用的实际所有权机制。[Apple 的 launchd 作业约定](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)

**最小拟改范围。** Linux 在 `plugins/ssh/src/engine/local-pty-herdr.ts` 的 argv 组装点接一个按平台选择的宿主适配器；复用第一项清单字段，也可对注入的独立临时清单单测。Engine 注入宿主工具及可信门控路径，必要时在现有桌面资源规则中加入门控 helper。systemd 用户管理器既有的 scope 负责后代归属，无需加入第三方进程树扫描依赖。Windows 先只加原生 fixture；需增强时限于持有 Job 的原生启动处及相应随包配置。macOS 在有实证前仅增加能力判定、诊断与 fixture。

## 真实夹具及判据（本次未执行）

只用临时 Vault、临时 SSH 私有端点、回环临时端口及夹具自己的进程。使用真实 0.1.19，Linux 至少跑两类环境：现有 `apps/engine/test/web-share.test.ts:138` 的自定义 XDG（覆盖无用户服务回退），以及使用真用户 bus 的普通桌面 Engine（覆盖 per-run scope）。后者仍用隔离 Vault、随机 SSH session/端点与一次性 unit。断线代理只代理测试端点。所有时间从 Main 发请求开始记录，PID 要连同出生身份核对。

| 独立验收 | 夹具动作及应观察到的结果 |
| --- | --- |
| 第一项／正常 | 同时运行 SSH A、SSH B、同机 Agent、另一个写者持有的同名同 manifest ID 的复制 Vault；再开 A 的只读窗口。断 WS 后重挂原 PID，行列正确。单关 A 不影响 B。关闭只读窗口不改清单、不连接/停写者 Core。停用/切 Vault 后，旧标签记录被清除、原 Core 与每个 holder 出生实例退出，私有端点无法连接，其余对照 Shell 仍能收发并保持原 PID。 |
| 第一项／时序故障 | 插入屏障覆盖 ensure 已发但未返回、run 尚未发、run 已创建但回复被丢、attach 前及 framed hello 卡住。另测 list/kill/rm/stop 的回复丢失、stop 卡死、模拟 CLI 退出零但旧 holder 仍活。在每一屏障并发 close/dispose 两次，延迟到对账之后再放行。真实 run 仅有一次，旧标签最终消失；关闭全代后没有迟到的新 Shell。必须能区分“未确认”与“退出”；在可控响应夹具内 12 秒完成 SSH，窗口总退出 <15 秒。永久失联夹具在预算内落待核对记录，恢复管理器后下一写者收敛。 |
| 第一项／重启及碰撞 | 在写意图后、run 执行后但写 address 前、关闭一半时结束**夹具 Engine**；重启同 Vault 写者，包括保存为 SSH 停用的情况。另做仅 holder 幸存、端点复用但 Core 不符、清单复制到异目录、伪造历史 PID 指向一个仍响应的对照进程。核对新写者只回收有证旧代；身份冲突留档，对照响应与出生身份不变。 |
| 第二项／脱离和重复清理 | 在真实 Shell 中启动夹具监听器，让其脱离 TTY、关闭标准 fd、清空环境并在父进程退出后继续响应随机挑战。先证明它独立存活、原 run scope 有成员；外部再起相同程序名的对照监听器。分别由显式关闭、Shell 自然结束、停用、换 Vault 及 Engine 崩溃复启触发清理，两次调用均收敛。回收后原组为空/消失、原出生实例消失、端口可重新绑定，对照仍回答自己的挑战。 |
| 第二项／宿主和平台边界 | 模拟同名 unit 拥有新 InvocationID、停管后失联、管理器拒绝创建、shell 放行前 Engine 消失、cgroup 只读及无用户 bus。重用 PID 对照可通过注入过期出生身份确定性验证；不以等待系统偶然重用为唯一手段。缺能力时不启动宣称严格管理的 Shell；握手前失败没有遗留监听器；已运行但失去证据时不终止对照。Windows 原生/WSL 分开记录宿主 Job 与来宾监听器；macOS 先以清空环境的脱离夹具测出剩余边界。三平台均验前台作业控制、Ctrl-C、resize、自然退出及重新挂接。 |

现有项目记录 `.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H-remaining-linux.md` 已有普通 Shell 的 PID、重挂、Web 拒绝、正常停用和 socket 目录验证。本报告仅交付设计以及上述本机只读证据，没有在真实 Vault、Core、系统服务或业务代码上做任何改动；未运行测试、构建或新建/停止服务。Linux 桌面 scope 的实际授权、15 秒内完成率、macOS 全覆盖及 Windows/WSL 行为仍待独立夹具验证。

## Lead 验收

Lead 已核对 `96b22c0a`、上游参考 checkout 与 0.1.19 发行合同。接受只读设计交付。后续先补本机 PTY 的分阶段对账，再按宿主验证专属进程归属与回收。当前原生夹具仅覆盖健康 Core 的正常停止，A17 保持待验。
