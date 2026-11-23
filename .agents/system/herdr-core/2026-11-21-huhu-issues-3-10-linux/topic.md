# Huhu Issue #3–#10 Linux 接续实施

接续 Windows 主题 [2026-11-20-huhu-issues-3-10-implementation](../2026-11-20-huhu-issues-3-10-implementation/topic.md)。旧主题的终端地址与 `D:/Document/code/huhu` 路径只作历史索引；本主题在新 Linux 机器重新登记。

## 目标与验收

- 目标 — 完成 [批次 Goal](../../../dev/changes/2026-11-19-huhu-issues-3-10/program.md) 的 #3–#10，交付同一组合版本的成员验收、三条联验、集成提交，合入 `feature/issue-fix` 并落地 `origin/main`。部署与发布不在范围。
- 验收 — 在同一固定候选提交上运行 lint、knip、format:check、typecheck、test、build、e2e（xvfb）及可生成的包；逐 Issue 对照验收要求。未测项单列，不记为通过。
- 约束 — 原型已确认（`6da1b2ec`）。保留 #2 已交付行为。隔离 Vault、回环夹具，不写真实凭据、真实 Vault 或原生 Agent 历史。Codex 不用 fast、不用权限绕过参数。最多 4 个本批次 worktree（主工作区 + 3）；`huhu-wt-int`、`huhu-wt-rc4` 为 #2 遗留，用户决定不计入、不动。

## 共享位置与负责人

- Lead — 本机 Codex 主会话 `t3p`，以同号 report 文件核对交付。接手前的 Lead 为 Claude Code 主会话 `6eb33f20-92e2-4d37-9734-f2bcf22f220a`，原进程随本机重启结束。
- Core 连接 — 本机 Linux（`wta-ubuntu`）默认 Core，hc 0.1.21，Codex CLI 0.171.0。此前核对的随包 Herdr Core 为 0.1.19（`apps/desktop/resources/herdr/linux-x64`）。
- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 目录规则 — `encodeURIComponent(terminal_address)`
- 运行环境 — Node 24.21.0（`$HOME/.volta/tools/image/node/24.21.0/bin` 置于 PATH 前；系统默认 Node 26 不用），pnpm 12.10.1。
- Codex 当前启动 — `codex --no-daemon -m <模型> -c model_reasoning_effort=<级别>`，沿用宿主权限；不带 fast 或权限绕过参数。worker 报告写在工作树 temp/final-audit，Lead 收取；worker 不执行 hc send，不运行重型验证、不提交。下方旧沙箱/临时索引方式仅属历史记录，不适用于本轮。

## Worktree

| 路径 | 分支 | 用途 | 写入者 |
| --- | --- | --- | --- |
| `/home/wta/projects/huhu` | `feature/issue-fix` | 交接资料、本主题 | Lead |
| `/home/wta/projects/huhu/temp/issue-worktrees/integration` | `impl/huhu-issues-3-10-integration` | 集成；Engine/Renderer 装配、插件注册、Vault 包收集器、静态能力目录、根锁文件 | Lead |
| `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux` | `impl/huhu-mail-graph-completion` | 非 SSH 收尾修复；HEAD f0fb1810，4ae旧候选之后的差异 | Lead；worker 按当前 task 划定文件 |
| `/home/wta/projects/huhu/temp/issue-worktrees/resume-linux` | `handoff/huhu-2026-11-22-integration` | #7 恢复检查点，复用已合入的 `safe-git` 工作树 | Lead |

只读快照（非 worktree）：`/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b`（`git archive 4d86c84b`）。

## 决定与交接

- 2026-11-22 16:11（Asia/Taipei）在 `resume-linux` 一次性复原 `cc671b5f` 与 `53e516ca` 的合并。三阶段索引和三份工作文件均与原现场完全一致。原集成树继续实施，恢复副本保留为检查点。整批交付继续按 [批次 Goal](../../../dev/changes/2026-11-19-huhu-issues-3-10/program.md) 推进。
- 2026-11-22 #7 合并 `ade79b58`、接线 `690e9097` 已提交，Linux 原生 PTY 定向证据已保存。原候选 `t34/task01.md` 继续等待完整验收。装配分析 `t4k/task01.md` 已核对。规格审查 `t4v/task01.md` 与项目规范审查 `t4t/task01.md` 固定看 `690e9097`。录制回放由 `t4x/task01.md` 在独立工作树推进。
- 2026-11-22 续工至 `ee599ce6`。录制回放已合入 `67d1f008`，外部 SSH 工作区布局和丢失本机 PTY 启动回复已有定向验证。恢复树留在原合并检查点。批量跳板由 `t4x/task02.md` 推进。接受 `t5h/report01.md` 的私有 Core 生命周期设计与 `t4v/report02.md` 的桌面、Web 和看板组合审查。OpenSSH CA 及用户证书选型见 `t5h/task02.md`。T7.1 接入已复验，W8.3 共同安装包尚未构建。

- 2026-11-21 接续核对：61 个远端分支与 `handoff-branches.tsv` 完全一致，远端无后续推进。`origin/main` 比集成多 73 个提交（#2 收尾 `454bec7a`、`38cc28f6`、`e58586c6`、`7811141b`），集成需先合入 main。
- Codex `workspace-write` 沙箱把 worktree 的 Git 索引（`.git/worktrees/<名>/index.lock`）和 worktree 内 `.agents/` 挂成只读，`/run/user/1000` 也只读。约定：worker 不直接提交，改为用临时索引生成候选提交对象（`GIT_INDEX_FILE=$(mktemp) git read-tree HEAD && git add … && git write-tree && git commit-tree`），在报告给出候选 SHA，并保持工作树与候选一致；Lead 核对后 `git merge --ff-only <候选>` 落到分支。evidence 文件放进候选树即可。跑测试时设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
- `0f242e2f`（t6/task01，#9 P0.1 跨平台本机保护）已由 Lead 快进到 `impl/huhu-issues-3-10-safe-git`。
- Codex 启动时会自动 `npm install -g @openai/codex` 升级（t18 首次启动即发生并退出）。为固定批次内版本，Codex 启动参数追加 `-c check_for_update_on_startup=false`；本机解析到的仍是 `codex-cli 0.170.0`。
- 2026-11-21 Lead 会话重启后 Core 终端全部结束（`hc ls` 为空），e2e 后台运行停在第 157 项。用同一 Codex 会话 ID 在新终端恢复：t6→`t1b`（会话 01a1fd5b-f317），t10→`t1c`（01a1fd7b-bce6），t19→`t1d`（01a1fdef-c0d8）。它们接续原任务文件与原报告路径（`t6/task03`、`t10/task02`、`t19/task01`），manifest 仍以原地址行跟踪；`HC_TERMINAL_ID` 与任务文件中的地址不同属预期。
- 更正：19:55:40 与 20:27:37 两次终端全部结束都是 `systemd-oomd` 在内存压力下杀掉了承载全部终端的 `hc-hold-*.service`（`journalctl --user` 可查），不是测试 Core 抢占。此后约束：同时跑测试的实现者最多两个；vitest 加 `--maxWorkers=3`（全量用 `pnpm test -- --maxWorkers=3`）；Lead 不在实现者跑测试时运行 e2e 或全量测试。以同一会话 ID 第二次恢复，新地址见 manifest 之外的下一条。
- 第二次恢复：t6→`t1g`，t10→`t1h`，t19→`t1j`，仍接续原任务文件与报告路径。
- 2026-11-21 第二波：集成到 `f7901b0a`（全量门禁在 `4a9a7305` 通过：test 1665/0/20；之后仅放开 Mail AI 选择用例并记定案）。`agent-linux` 工作树改用分支 `impl/huhu-issues-3-10-g6-protocol`（原分支已并入集成），`safe-git` 快进到 `f7901b0a`。派发：`t1k`（g6-session，#6 HTTP MCP 会话身份，sol/high），`t1m`（p83-safe，#9 P8.3，sol/high；原 `t6/task04.md` 未派发，改由本终端执行）。
- 2026-11-21 23:52 机器重启，t1k/t1m 结束。以同一 Codex 会话恢复：t1k→`t1r`，t1m→`t1s`，接续原任务与报告路径。Lead 在集成落 `fc048b6b`（health.run/外部布局读取不启动 Core）。
- 第 2 轮独立审查：`t1t`（review-2，sol/xhigh），快照 `temp/issue-snapshots/fc048b6b`。
- 2026-11-22 00:16 第三次 `systemd-oomd` 杀掉 hc-hold（峰值 28.1G：两名实现者同时跑全量测试，外加审查者）。新约束：全量 `pnpm test` 全机同一时刻只允许一份，一律写成 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`；定向 vitest 用 `--maxWorkers=1`。Lead 自己的全量/e2e 同样取这把锁。t1k→`t1y`，t1m→`t1z`（同一 Codex 会话恢复，接续原任务与报告路径）。
- 2026-11-22 第三波：集成 `499427be`（含 #6 会话身份 `1aa5f3b9`、#9 P8.3 `2c7994d3`、第 2 轮审查返工）。`t1y` 续做 t1k/task02（G3.4，分支 `impl/huhu-issues-3-10-g6-extensions`，agent-linux 工作树）；`t23`（g6-kernel，sol/high）做 Kernel 管理组（分支 `impl/huhu-issues-3-10-g6-kernel`，safe-git 工作树）。t1z 已关闭。
- `t26`（g6-tasks，sol/high）：#6 Tasks/Automations 领域组，分支 `impl/huhu-issues-3-10-g6-tasks`（agent-linux 工作树，基线 `5307b88f`）。t1y 关闭。
- `t27`（g6-notes，sol/high）：#6 Notes/Archives/Inbox/Guide 领域组，分支 `impl/huhu-issues-3-10-g6-notes`（safe-git 工作树，基线 `e3aa1cd4`）。t23 关闭。
- 集成 `d7581825`（含 C05 `ecc1bd93`、Tasks/Automations 组）。`t28`（g6-agent，sol/high）：#6 Agent CLI 领域组 + tasks.dispatch.targets 无拨号快照，分支 `impl/huhu-issues-3-10-g6-agent`（agent-linux）。t26 关闭。
- 集成 `9aedbdf5`（含 Notes 组 `d07ba94c`、home.notes.recent）。`t2q`（g6-versioning，sol/high）：#6 Versioning/Safe 领域组，分支 `impl/huhu-issues-3-10-g6-versioning`（safe-git）。t27 关闭。
- 集成 `eaa5545a`（含 Agent CLI 组）。`t2r`（g6-mail，sol/high）：#6 Mail 领域组 + Mail AI 工作台一次性批准，分支 `impl/huhu-issues-3-10-g6-mail`（agent-linux）。t28 关闭。
- 2026-11-22 Lead 会话重启后（约 06:50 又一次 oomd）：用户提交 `e46661fa`（根 vitest.config.ts maxWorkers:3 与 AGENTS.md「测试与内存约束」），Lead 拣选到集成 `79305dcd`。新约束：开发中只跑涉及的测试，全量仅 Lead 收尾跑一次。g6-versioning 与 g6-mail 由用户恢复为 `t2w`、`t2x`（接续 t2q、t2r 的任务与报告）。集成 `314c0bed`（含 Versioning/Safe 组）。`t2y`（g6-ssh，sol/high）：#6 SSH 领域组，分支 `impl/huhu-issues-3-10-g6-ssh`（safe-git）。t2w 关闭。
- Mail 候选 `f3e764e8` 合入集成 `e6fe4f5b`，Lead 修正 `2b3fe70a`；t2x 原以默认沙箱恢复（无回环），以标准参数恢复同一会话为 `t2z`，执行 t2r/task02。
- 集成 `fc044713`（含 Mail 组）。`t30`（w05-widgets，sol/high）：#10 W05 业务卡归属迁移与 W06-01，分支 `impl/huhu-issues-3-10-w05-widgets`（agent-linux）。t2z 关闭。
- 2026-11-22 07:39 第四次 `systemd-oomd` 杀掉 hc-hold（峰值 27.4G，swap 8G，102 个进程；t2y 跑 typecheck/vitest/e2e，t30 跑 e2e/打包检查，t3c 跑 e2e）。根因是多个实现者同时跑重型验证。**新分工**：实现者只写代码和对应 E2E 用例，只跑单个涉及的 vitest 文件；不跑 E2E、打包、全量测试、全仓 typecheck/lint/knip。重型验证由 Lead 收尾串行执行（取 `flock /tmp/huhu-heavy.lock`）。已写入 AGENTS.md「实施者职责边界」与任务模板。恢复 t2y、t30 时以此约束为准，并在新任务文件里写明。
- 2026-11-22 07:39 第四次 oomd（typecheck+e2e+打包叠加，27.4G）。用户更新 AGENTS.md「实施者职责边界」：worker 只写代码与对应单测/E2E spec，只跑单个 vitest 文件；禁止 build/打包/全量 test/全仓 typecheck/knip/lint/视觉截图；E2E 只写不跑，列文件与用例名由 Lead 串行执行；报告单列未运行验证。t2y→`t3q`、t30→`t3r` 以同一会话恢复，续原任务（t2y/task02、t30/task01）与原报告路径。
- 2026-11-22 t3q 验收 report02（Q6-3 SSH 主机授权，集成 `e0cfa33c`），续派 t2y/task03（剩余 79 个 SSH 动作）。t3r 验收 t30/report01（W05/W06，集成 `369efcfd`，含 web-share 两邀请三会话 E2E 通过），t3r 关闭。`t3v`（t5-tasks，sol/high）：#5 T1.4/T4.1/T5.5/T7.1/T7.2，分支 `impl/huhu-issues-3-10-t5-tasks`（agent-linux，基线 `369efcfd`），任务 `t31/task01.md`。Lead E2E 注：隔离钥匙串下需 PATH 前置 volta node 与 `PLAYWRIGHT_BROWSERS_PATH`，否则 web-share 会 skip。
- 2026-11-22 t2y/report03（SSH 主机管理 4 项）验收，集成 `adb5ff2d`；t3q 关闭。`t3w`（ssh-actions，sol/high，新会话）：t2y/task04 剩余 75 项，分支 `impl/huhu-issues-3-10-ssh-actions`（safe-git，基线 `adb5ff2d`）。
- 2026-11-22 t31/report01（#5 T1.4/T4.1/T5.5/T7.1/T7.2）合入集成 `d2601f83`，Lead 修测试类型 `7cfed9bf`；t3v 关闭。`t3x`（w4-agent，sol/high）：#4 W5.2、agent.catalog.detect、W8.2/W8.3 代码部分，分支 `impl/huhu-issues-3-10-w4-agent`（agent-linux，基线 `7cfed9bf`），任务 `t32/task01.md`。注：Lead 误执行 `git worktree prune`，移除了 huhu-wt-int 的陈旧登记（该目录 .git 链接早已缺失，目录与分支 closeout4/final 未变）。
- 2026-11-22 t32/report01（#4 W5.2、agent.catalog.detect、W8.2/W8.3 spec）合入集成 `1c2f8089`；t3x 关闭。t3w 改为连续推进不逐批停。`t3y`（mail-safe，sol/high）：#8 S2.3/S8.2、#9 P3.4/P10.1/P10.2，分支 `impl/huhu-issues-3-10-mail-safe`（agent-linux，基线 `1c2f8089`），任务 `t33/task01.md`。
- 2026-11-22 t2y/report04（SSH 19 项）合入集成 `9ccd6d28`，Lead 修正 `a54d8ef4`、`00d644d3`；56 项关闭理由不符 #6 原文，不接受。t3w 关闭。`t3z`（ssh-owned，sol/high，新会话）：t2y/task05 外部主体自有对象模型开放 56 项，分支 `impl/huhu-issues-3-10-ssh-owned`（safe-git，基线 `00d644d3`）。t3y 两项越界请求裁决：不改 Renderer CSP（远程图片经 Engine 取回以 data: 返回）；允许其在 packages/kernel Web 服务加 Mail 附件受权文件流窄路由（本轮唯一写入者）。
- 2026-11-22 10:08 Codex 登录过期（access token 09:54 到期，新会话停在登录页），用户重新登录后以 `t47`（ssh-owned）执行 t2y/task05；t3z、t40 停在登录页已关闭。Lead 在集成 `00d644d3` 构建上跑 #3 Linux 窗口与关窗 E2E（window-chrome、session-flush）。
- 2026-11-22 #3 Linux E2E（集成 `00d644d3` 构建，xvfb+隔离 Secret Service）：window-chrome+session-flush 19 过 / 6 败 / 7 跳。6 败均为 session-flush（B09×2、A08×2、C06×2），测试本体通过后 `app.close()` 挂起 56s 超时；在 `fc044713`（本轮 W05 之前）构建上 B09 同样失败，非本轮合入引入。main 基线只列 A08 一项；留待 main 最终全量 E2E 对比定性。
- 2026-11-22 t33/report01（#8 S2.3/S8.2、#9 P3.4/P10）合入集成 `cd0ea9c4`，Lead 返工 `72b0bad5`、`e9e6fcd9`（E2E 退出前清路由，修复 session-flush 关窗挂起）、`82f0d188`（Web 取消上传按钮被禁用）。t3y 关闭。
- `t4c`（h7-ssh-ui，sol/high）：#7 H2.5/H2.6/H3.1–3.5/H4.3/H5.1–5.4/H11.3，分支 `impl/huhu-issues-3-10-h7-ssh-ui`（agent-linux，基线 `82f0d188`），任务 `t34/task01.md`；与 t47 按文件分界（t47 独占 SSH capabilities/index/public-*/host-intents/manifest）。
- 2026-11-22 t2y/report05（外部主体自有对象 49/56）合入集成 `b25c6322`；t47 关闭。`t4d`（ssh-last，sol/high）：t2y/task06 最后 6 项与动态/远端转发，分支 `impl/huhu-issues-3-10-ssh-last`（safe-git，基线 `b25c6322`）。

- 2026-11-23 t13c 快照35项DOM与t13f vendor类型通过。t13d独审补出 TipTap Activity 暂停DOM边界，t13j/task01仅补真实挂载回归，Lead先红灯再返工。t13b/task01修保存队列基线与字段快照；t137–t139已记录失败。HTML四文件单独保存f0fb1810，其余差异保留，未推远端。

## 2026-11-23 03:40 继续固定候选验收

05a748b6 agent-linux 保持干净。t15n 完成：notes31/1，mail9/4，旧非SSH失败选择22/11，另2worker清理错误。t15r Notes TB15单例通过，不据此关闭偶发启动问题。t15q包9组已完成：workspace1和package5通过；tasks模板dispatches检查失败；web/tools-web/web-terminal/rule/git共7用例停在Engine身份断言；native缺少linux-fixture未运行。原始结果不覆盖，汇总 agent-linux/temp/final-audit/fixed-candidate-results-05a748b6.md。

复用既有干净integration工作树切新分支impl/huhu-acceptance-followup（05a），未新增工作树，原integration分支4ae保留。t15t sol/high处理Agent评审/自动化结果/Gateway/W05/Agent设置失败，t15v sol/high处理VaultIndex批次重复快照，t15w astra/high只读核对候选Engine身份与模板异步契约。各task写清范围，禁止E2E/build，Lead串行验证。Lead独占tests/e2e/perf.spec.ts与workflows/mail.spec.ts；已修正定位和洪流样本边界，局部lint/format通过，未实际E2E。

t15s只读报告已收取验收归档并清理终端；其回告权限提示不影响产物。t15t现代指南网络提示取消，Lead完成search并retrieve js，交给worker完整阅读/tmp/mwg-guide-742470-1795376192756.md，不要求重复申请。SSH继续暂停，未更新main。

## 2026-11-23 04:02 Lead继续位置
工作树integration分支impl/huhu-acceptance-followup基线05a，未提交。root最新实现：notes.save规范路径事件(已交t169配套修复异步自通知)、candidate-desktop身份及关闭后PID缓存、perf正确搜索角色+开始时纳样等慢样本+必须覆盖结束、task-journey固定Codex常规检测配置、external-task-web仅create通用意图键、Mailcombobox。t166 T7.2旧包诊断1pass，t16h D09旧包诊断1pass含cleanup，t165Notes85pass但后发现迟到自身通知P2，t169处理中；t16fAgent类型pass，t16j差异E2E类型pass。新业务代码需要构建后验证，不能以旧包签收。
活跃任务t15t/task02 Vault大小写改名返工，t168/task02 Agent与helper/fixtures独审，t169/task01 Notes迟到通知返工；报告在integration/temp/final-audit同号文件。t163/t15y已收报告并释放。重型锁空闲，最近test-results已保全tools-web-cleanup-artifacts-05a。下一步收取修复/审查，补类型/差异回归，验证自动化运行结果单例（shell.spec有失败诊断），再提交组合构建、定向失败集/新业务/固定包验收；不重复全量，不开发SSH。远端feature最后05a，main4ae。

## 2026-11-23 04:24 接续
Lead t3p，integration/impl/huhu-acceptance-followup，HEAD05a未变，源码未提交；SSH继续暂停。t15t/task03已交回并冻结Agent删除未知意见恢复、Notes每次writeId自身通知识别。Notes91、Agent focused12通过，Lead t16v实际Engine2通过、t16w contracts/Notes/Agent定向类型通过。t16n/task02在独审Notes；t168/task05独审Agent删除未知意见，以及Lead的Vault watcher暂扣创建轮询修正。对应报告 temp/final-audit/t15t-report03.md、t16n-report02.md、t168-report05.md（后两待收）。
Vault t168/task04发现heldCreated与poll交叉旧名复活，Lead按其单点建议filter已修，watcher新增真实callback+rename+poll回归先1失败8通过，后两文件30通过（t16x/t16y，held-create-poll-{red,check}.log）。此前purepollcase2红→29绿，Vault类型t16t绿。全部diff TS/TSX30文件格式/oxlint通过。
旧05a包新的诊断：t16m native2/rule1/git1通过，web-terminal2过1失败；Lead真实bashPTY复现后台stty SIGTTOU暂停，采样子shell trap TTOU后t16p web-terminal3过，t16q定向E2E类型过。日志 diagnostic-sampler-web-terminal-05a.log及artifacts完整保留，JSON temp/candidate-acceptance/web-terminal.4wf77g/result.json。仅旧包+新测试诊断，不能作为新组合包验收。
下一步收t16n/task02+t168/task05报告，定向返工如必要；确认后commit/push已授权feature分支，保留changes；串行构建新组合并复验旧失败/当前受影响场景。不重新跑全量套件/全量E2E。Main仍4ae7，feature最后核对05a，新source/package未生成。不得宣称goal完成。

## 2026-11-23 组合已推送并构建（接续以此为准）
integration/impl/huhu-acceptance-followup clean HEAD 4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73。t172实际远端feature同SHA；main仍4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030。提交d1432fd3 Vault、383a385e Agent/Gateway、c0870297夹具、a821d4ca Notes、4a54f0a9证据。t16n/task03已关闭跨重载两反例，Notes93通过，t171最终Vault/Notes定向类型通过。t15t/t168/t16n均已收报告并kill/rm；manifest done。源码构建t173 exit0，temp/final-audit/followup-combined-build.log，apps/desktop/out/build-info.json真实commit4a54f0a9。
当前唯一重型工作：hc t174 huhu-followup-targeted-journeys，在 integration 执行 temp/final-audit/run-followup-groups.py。串行failed11（仅上一轮33中仍失败11）、notes完整受影响DocumentSession E2E、mail13。wrapper run-followup-source.sh检查clean HEAD与out/build-info commit，隔离HOME/XDG/DBus/Keyring/Xvfb，flock /tmp/huhu-heavy.lock，固定Codex。无旧包注入。本轮是新sourcebuild真实UI验收，尚非安装包验收。每组保全test-results到followup-{group}-artifacts-4a54f0a9，log followup-{group}-4a54f0a9.log，汇总followup-groups.json；wrapper原始结果在 /home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/followup-{mode}-{sha}.XXXXXX。
接续先 hc wait t174 后读日志，不重复启动，不并跑重型。实际失败先保全当前trace再修。全量已历史跑过不重跑。此新组合尚未打包；旧05a包与旧integration包都不能冒充4a包。仍需最终共同包联验、逐Issue证据与origin/main交付。Graph S5.2产品口径仍待用户，SSH暂停change和远端分支保留。goal active未完成。

## 4a54f0a9 定向联验进行中
- t173 构建通过；t174 正串行执行 failed11、Notes、Mail，勿重复启动。failed11 已结束：3 passed / 8 failed，完整日志 integration/temp/final-audit/followup-failed-4a54f0a9.log；artifact 已由 runner 保全 followup-failed-artifacts-4a54f0a9。Notes 正在执行，尚无最终结果。
- failed11 的 H05、审查输入和网关通过；四项性能测量超标，终端10MiB仅5样本（p95 29.7ms但样本不足，仍失败），自动化结果定位、旧看板任务卡、Agent初始检测文本失败。
- 任务滚动既有10次66–133ms帧间隔，亦有 app.close 不返回；独立保全 followup-task-scroll-evidence-4a54f0a9。test.trace dzvl@46断言失败，dzvl@48 Close context 无 after，约54秒后总超时。不要把前者隐藏在关闭超时中。
- t175/task01 astra/high 正只读分析性能与退出；t176/task01 sol/high 正只读分析三个非性能UI失败。业务与测试文件保持干净，避免正在执行组读取混合版本。两者均不得跑重型验证或改代码。
- 当前 feature 4a54f0a9、main 4ae7e7e4；新包尚未构建，不能用旧05a包代签。

## 4a54f0a9复验结束与即时投递修复（本轮接续）
- t174已结束：failed3pass8fail；Notes31pass1startupfail；Mail13pass。三组wrapper exit1包含trap rm临时Volta目录被重建导致Directory not empty，Mail无测试失败。全部artifact已按组保全，勿重跑整组。
- t177相同应用构建、Notes失败单项附失败时URL/body/readyState/资源诊断，1pass；不是间歇启动修复。产物notes-startup-diagnostic-artifacts-4a54f0a9。Lead改tests/e2e/knowledge/session-slow-bridge.ts加失败附件，单文件format/lint通过。
- t175只读性能报告已验收收取，terminal已kill/rm；report在temp/final-audit/t175-report01.md。尚无CPU profile，不能猜热点修生产。t178/task01 sol/high编写perf.spec可选诊断与真实键盘低往返采样，无E2E权限，Lead接续串行实测。
- t176/task01报告已收取；task02正实现Task receipt即时唤醒和3项UI/夹具修复。因worker沙箱回环EPERM，由Lead执行t179红灯（2个pending!=delivered），t17b绿色40/40。任务后台生产diff已稳定；UI/夹具仍在编辑。t17c/task01 sol/xhigh独审后端稳定diff，报告temp/final-audit/t17c-report01.md。
- 当前HEAD仍4a54f0a9，工作树新改动未提交；没有新构建/包。根目录program/evidence已记录本轮验收。待worker完成、独审、差异类型/静态门禁后保存提交并继续定向UI，不重跑全量。
- 本轮异步问题已发：Graph旧信移回收件箱是否通知。未收到答复，依赖行为不自行决定。

接续：t17h 三项探针类型错误已由 t178/task02 修正，t17j 定向类型通过。Tasks 后端独审 t17c/task02 关闭ACK同步扫描，剩余加载反馈由 t176/task04 实施。Lead 已启动固定4a滚动诊断，保留原严格阈值。未重新构建或提交，远端仍4a。

最新：t17k滚动诊断证实1000文件事件约1000 tasks.list请求，退出flushing后home.focus.get未返回，3秒弹保存确认失败框，60秒超时；证据已保全。t178/task03限定workbench查询事件合并修复中。t17m洪流400键上限在3.5秒提前退出，t176/task05限定perf.spec移除次数限保留20秒/满速10MiB。Tasks及UI/夹具独审已关闭并提交5aeac32e，t17n推送后远端feature=5aeac32ee00e0f3d5cfd2faf4e27f1840762865c，main仍4ae7e7e4。构建仍4a。诊断脚本现接受4a为HEAD祖先且强制build-info匹配，不冒充新代码运行。继续新查询修复/驱动验证，保留change。

接续重点：t17p完整终端采样退出0，1311窗内样本、p95 32.4ms、完整尾标；另有CLEANUP_INCOMPLETE。t17c/task04独审重算通过，报告已保存，Lead补真实input/值变化断言（既有数据已满足）。t178/task03查询合并代码冻结，engine-client.test.ts24通过，t17q Workbench类型通过，定向lint通过；t17c/task05正在独审。当前源码HEAD5aeac32e已推送，query/react/tests及perf/helpers与证据文档仍dirty。不得构建假冒干净版本，待独审收口后提交/推送并固定新组合串行pnpm build，再原滚动/退出与Tasks结果UI验证。当前app仍4a。

最新交付：t17r推送并核对feature=5fefa5077eb24f5bbf7a5cf667ac071b0a8d4938，main=4ae7e7e4。该提交只保存独审通过的perf驱动/诊断和真实证据；Workbench query三文件仍未提交。t17c/task05中项权限/插件在途撤销应立即取消重查，低项scope等待结算缺口，均交t178/task04实施。没有新组合build。已准备temp/final-audit/run-query-followup.sh/py，干净固定HEAD+build-info检查，perf模式前5项（不跑scale），result模式shell自动化运行结果，重型锁+隔离环境；待返工审查/提交/构建后运行。

清理诊断：两轮flood的CLEANUP_INCOMPLETE并非泛型rm问题，隔离HOME /tmp/hc-t.WPxIRS/home 和 /tmp/hc-t.td9Bfc/home仍有本夹具Core/holder/sh。Lead逐PID匹配HOME及comm后SIGTERM，核对六PID全无live，再删这两个精确目录。未来fixture复用server.stop回执和实际退出，由t176/task06限定perf及helper修正（不改变产品持续会话）。t178/task04权限和scope返工仍live working，hcwait超时仅为观察超时，无重启。待两worker报告与独审后固定新build。

## 05:35接续
Query task04 独审关闭，29测试及t17t类型通过，尚未提交。t178/task05负责perf清理独立超时；t176/task07只读调查Volta shim隔离HOME递归；事件见integration/temp/final-audit/flood-cleanup-incident.md，精确进程组已回收、同HOME进程0。不得继续重型测试直到环境修正。main仍4ae，feature5fef。

## 固定da645ee8
查询a97ece84、perf清理da645ee8已远端feature核对，main未变。t17y固定clean源码构建通过；t180正在单独运行5项受影响perf（受控PATH，重型锁）。t176/task08仍只读诊断旧4a尾标缺失。后续串行结果展示、共同包验收。

## da645实测接续
t180性能3pass/2fail/3扩展skip：1MiB444ms、输入11.6ms、滚动50ms和退出通过；inbox启用472ms/300失败、终端20s尾标缺失。t181任务结果旅程通过。t178/task07只读启用诊断，t176/task09只写终端阶段观测，Lead后续单项实跑。构建da645，featureda645，main4ae。

## 2026-11-23 06:04 接续检查点
候选feature已推送840baba8e56cef9b97c04c565c0c89d8fd5adeac（t186远端回读）；main仍4ae7e7e4。仅新增诊断和证据，应用构建仍da645ee8。t185三文件E2E定向types通过；t17c/report11已关闭诊断清理低项。t183插件诊断1pass：1845ms/off38/on279/RSS341MiB；此前472ms失败不删除。目录14MB中95%重复布局schema；t178/task10实施?view=names+工作台names消费+实时授权回归，报告temp/final-audit/t178-report10.md，待独审。t176/task10只能静态定位，worker沙箱启动私有Core被EPERM拦截，撤回了临时探针；已发task11恢复单文件attach诊断供Lead执行（不再让worker试跑）。报告temp/final-audit/t176-report11.md待收；Lead应先核对安全隔离与清理，再hc后台锁heavy运行其精确单Vitest命令。t17c空闲可接下一实现独审。SSH保持暂停。
重要证据temp/final-audit/plugin-network-artifacts-da645ee8和flood-stages-artifacts-da645ee8。Core尾标读在21.075s之后，不能反推20s前何时完成，WS测量亦是Playwright观察时刻。不要把低字节等同丢失源字节（Core可重绘）。名字投影不要改默认完整目录/MCP，也不要缓存授权。已授权继续完成goal，不标完成。

## 2026-11-23 08:40 候选包接续
应用包固定 f91a5515，AppImage SHA 4152f8ea2b48bb1e7f60192b2aa4f9f77b4622a7b8245e5c53f54926b997a0cc。t19h gateway/close 3项通过，external-agent来源与关闭后process()驱动错误已修。t19k外部CLI/MCP 2项通过且清理残留为零；t19q完整Web 1项通过（原失败仅清理重复close），源代码/包未改。驱动与证据已提交推送40a47ad3，main仍4ae7e7e4。t19s正在锁heavy串行跑其余8组同一f91包，应用SHA与驱动SHA分别记录，汇总temp/final-audit/remaining-package-results-f91a5515.json。禁止重复全量或重建未改变的包。t19r/19m定向类型通过。CLI账号额度使t194最新Notes独审未完成，依model-roles降级由Lead实查并明确披露。SSH继续暂停；仍无hc远端机器，线上邮箱/真实平台/第二设备缺证不冒充通过。

## 2026-11-23 同包验收及 main 落地完成
`t19s` 余下8组通过，f91同一AppImage总12组21项通过（零skip/flaky/errors）。已提交linux-package-f91a5515.json与linux-delivery-scope-f91a5515.md。t19v先核对祖先后快进main=feature=7c3a494b；落地回执文档追加c848e5a22441035067ceb25f1f76c4b35e9e45f1，t19w远端两分支同SHA。应用f91与后续docs/tests差异明确，未再构建；未发布。integration应clean。Goal未完成，外部平台/设备/账号、Graph通知决定及额度受限的Notes独审仍列缺证；不得宣称七Issue关闭。后续仅补未覆盖且可执行的验证，不重复全量/已通过组合；SSH仍暂停。

2026-11-23 首页八主题验收发现主动取消假错误，9d96e902 修复默认 cancel 语义，f55f0759 驱动与证据。t1b3 原包红；t1b4 29查询测试；t1b7/t1b8/t1bb 新包 dashboard、close、Web 4项通过。原生截图排除125%页面截图裁切。SSH未改；独审CLI额度限制和外部平台缺口未消除。

## 2026-11-23 用户更新 Codex 启动参数
用户明确要求后续启动使用 `codex --no-daemon --dangerously-bypass-approvals-and-sandbox`，模型与推理级别沿用角色配置。此要求取代本批次此前不传权限绕过参数的用户侧约定。当前实现已冻结，不为更改参数重启现有代理。

## 最终交付回执
2026-11-23：origin/main 与 origin/feature/issue-fix 回读同为 d056eb6383ae48411d808900c6094a48f772c07a；应用/驱动 f6c4e0d5684afa6e832340c4fbb4fd5445cf71b5。同包八组15项通过，历史源码UI两项通过，Graph16/16。集成工作树干净。证据见 integration/.agents/dev/changes/2026-11-19-huhu-issues-3-10/evidence/non-ssh-final-delivery.md；原始远端回执 integration/temp/final-audit/non-ssh-final-remote.txt。#7暂停，外部矩阵用户后测。
