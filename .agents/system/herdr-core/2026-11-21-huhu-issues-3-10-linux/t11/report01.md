# 任务报告 · 22e91432 独立审查

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t11`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t11/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t11/report01.md`
- 执行结果 — done

## 结论

| 改动 | 合入结论 | 规格与项目规范 |
| --- | --- | --- |
| #9 P0.1 · `0f242e2f` | 可合入 | 系统存储与注入边界符合本切片。Linux 实际后端和不可用场景已有证据。发布验收仍须补齐平台矩阵中的运行缺口。Linux x64 打包绑定已实测。更新上游台账的使用范围。 |
| #7 H11.2 · `be7a8b8e..0748a516` 与 `22e91432` 的接线 | 修复后合入 | 桌面 Engine 上的 CLI 和使用独立令牌的 HTTP MCP 已覆盖正常 Exec 链路。无桌面启动的凭据宿主、空闲退出和 MCP 会话隔离需在交付前解决。 |
| #8 S7.1/S7.2 · `1bac3348..5c1c52a9`、`3fa0f3de`、`85770368` | 修复后合入 | 常规路径按确认发送选区和可选问题，回复仅能采纳到编辑器。停用设置时可把当前 Key 误存入可移植配置，且有统一工具与事件缓存上的规格缺口。 |
| `2b280794` · 合并主线 | 修复后合入 | 同步授权与独占发布、冲突映射、原生改名回退均通过定向验证。发布成功后的暂存清理错误会导致假失败及回执丢失。布局类和守卫过滤已核对，台账还有旧编号。 |

### 发现（按严重度排序）

| 严重度与证据 | 组别及位置 | 问题与触发条件 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| P1 · 规格，确认复现 | #8 S7.1，`plugins/mail/src/engine/ai-settings.ts:203`、`:207`、`:213`、`:227`、`:232`；`packages/vault/src/package/package.ts:24`、`:37` | 已保存 HTTPS Key 后，保持同一地址，取消「启用邮件 AI」，选择保留，并误把已有 Key 填进模型字段。此时 `verify=false`，调用 `check(undefined)`，跳过对已保存 Key 的字段检查。 | 保存与普通读取响应都会返回明文，整 Vault 包也携带包含该 Key 的模型字段。回环 HTTPS 与合成 Key 已复现，停用保存时无额外网络请求。 | 把可移植字段检查从网络验证分出，在能读取当前 Key 时同样检查保留、替换、清除及停用保存。测试停用仍可用且无请求，并验证设置响应与包内无合成 Key。 |
| P1 · 规格，确认复现 | #7 H11.2，`apps/cli/src/connect.ts:47`、`:54`；`apps/desktop/resources/bin/huhu:17`；`apps/engine/src/main.ts:74`、`:92`；`apps/engine/src/boot.ts:152`；`plugins/ssh/src/engine/host-configurations.ts:104`、`:196` | CLI 无现有 Engine 时自行启动，打包启动器设置 Engine 入口，桌面对应的 `HUHU_DESKTOP_USER_DATA` 只由 Desktop Supervisor 注入。手工先在同一 Vault 配好主机，关闭桌面，再走默认 CLI 自启动。 | 主机摘要和作业受理成功，所有托管认证类型却无法取认证，作业随后失败为 `authentication-failed`，回环目标未执行命令。现有 H11.2 CLI 测试预先带测试宿主 boot，错过这条生产路径。 | 让启动器与桌面共用可信的本机应用数据定位，测试关闭桌面后正常 CLI 的启动、认证和 Exec。 |
| P1 · 规格，确认 | #7 H11.2 / #6，`packages/kernel/src/server/http-app.ts:110`、`:139`、`:154`；`plugins/ssh/src/engine/public-resources.ts:28`；`plugins/ssh/src/engine/public-jobs.ts:106`、`:257`、`:318` | HTTP MCP 无独立会话身份。两个客户端使用同一个已授权 Gateway 令牌时，Dispatcher 收到相同的 `caller/subject`，作业的读和取消只对比这个值和 `jobId`。 | 同令牌的不同客户端被判定为同一所有者，无法满足设计对会话间读取和取消的隔离。不同令牌已实测互拒。共享 bootstrap 主体安全拒绝了作业，但 `huhu mcp` stdio 因此依然不能跑完整链路。 | 由 #6 提供服务端验证且可重连的客户端会话身份，供作业和信任待答共同绑定。补同令牌不同会话与正常 stdio 测试。当前的独立令牌条件需在入口呈现。 |
| P2 · 规格，确认复现 | #7 H11.2，`apps/cli/src/connect.ts:54`；`apps/engine/src/main.ts:127`、`:132`；`apps/engine/src/boot.ts:579`、`:586`；`plugins/ssh/src/engine/public-jobs.ts:340` | 无界面 Engine 的空闲退出只看 HTTP/WS 活动和事件。已接收 Exec 在静默运行时，观察者停止轮询，异步作业没有计入存活判断。 | CLI 默认空闲阈值 60 秒，支持的作业运行时间上限为 180 秒。处于该窗口的作业可能被退出过程断开，本地结果变成待核实。使用真实 Engine 入口并把空闲阈值缩到 1.5 秒已复现。 | 让已受理作业在运行或核验期间阻止 Engine 因空闲退出，终态和取消完成后释放。保留显式关闭语义。 |
| P2 · 规格，确认复现 | 主线合并，`packages/vault/src/write.ts:153`、`:187`、`:228`、`:239`；`plugins/automations/src/engine/task-scan-occurrences.ts:123` | 硬链接已经发布目标后，删除自管暂存文件返回 I/O 错误。异步路径继承该问题，合并时复制到了带 `beforeCommit` 的同步独占创建。 | 调用收到失败，目标实际上已存在，仍链接同一 inode 的暂存文件解除跟踪，成功写入回执被撤销。外部扫描发生记录已落盘，但此次调用跳过后续推进。原生 watcher 也可能将成功写识别为外部变更。 | 把发布和发布后清理的错误分开处理，已发布文件保留成功回执，可安全识别的暂存条目延后清理。加同步与异步发布成功后清理失败的回归用例。 |
| P2 · 规格，确认 | #8 S7.2 / #6，`plugins/mail/src/engine/ai-settings.ts:53`、`:260`、`:309`；#8 `spec.md:41`、`source.md:326` | 静态目录和运行时都登记了五项，但全为 `exposable:false`，读取与片段调用也硬限定工作台主体。 | CLI 和 MCP 无法按统一工具配置开启这些操作。当前测试还明确期望 MCP 返回 `CAPABILITY_NOT_EXPOSED`。第 8 项规格中的统一、按项可选能力交付未覆盖 Mail AI。 | 与 #6 核定外部授权范围和用户确认机制。对按契约开放的操作复用同一 handler，保留秘密编辑和可核实的内容确认边界。 |
| P3 · 确认，规范 | #8 S7.1，`plugins/mail/src/engine/ai-settings.ts:242`；`packages/workbench/src/engine-client/query.ts:7`、`:33`；`plugins/mail/src/ui/MailAiSettings.tsx:29`；`plugins/mail/src/ui/MailAiAssistant.tsx:11`；#8 `source.md:348` | 保存发布了 `mail-ai-settings` 实体事件，但共享 `ENTITY_CAPS` 没登记。设置页对自己所在工作台手动刷新。 | 同一工作台的缓存通常能更新，单独的读取视图或未挂载设置组件的客户端不会靠该事件刷新入口状态。Engine 仍会拒绝失效确认。 | 在共享事件失效表映射 `mail-ai-settings` 到 `mail.ai.getSettings`，验证另一工作台更新。 |
| P3 · 确认，规范 | 主线合并，`docs/upstream/ledger.md:23`、`:40`、`:60`；`THIRD_PARTY_NOTICES.md:171` | 主行把 Open Knowledge link-preview 改为 R-71，OK 重放条目仍指 R-54。 | 跟随索引会到 Motty SSH 导入。生成的 notices 同样留有错误编号。 | 改源台账交叉引用，重生成 notices。保留 SSH 导入的 R-54。 |
| P3 · 确认，记录 | #9 P0.1，`docs/upstream/ledger.md:47`；`THIRD_PARTY_NOTICES.md:158` | 已扩大系统后端使用范围，上游手工条目仍只描述 Windows 的模块与用途。 | Linux 自动依赖表已有 GNU 包，手工映射依然不能解释 Linux 和 macOS 后端为何进入交付。 | 登记三个目标原生包的来源与用途，重生成 notices。核对各平台随包的上游许可文件。 |
| 验收缺口 · 待验证 | #9 P0.1，`apps/desktop/electron-builder.yml:8`、`:43`、`:56`、`:60`；P0.1 平台矩阵 | 当前配置和锁文件覆盖 Windows x64、macOS arm64、Linux x64。尚无当前候选在 macOS 和 Windows 安装包内原生调用的证据，亦未实测真实锁定集合。 | 独立架构与锁定时的解锁提示仍无法签收。锁文件另含 Linux musl 与 macOS x64 绑定。当前 Linux 构建使用 glibc，macOS 发布目标为 arm64 DMG。 | 在对应系统核对 ASAR 路径、实际 UtilityProcess 取用、锁定与丢钥匙后保留原密文。 |

## 产物与改动

报告基于 `22e914329e16d1cc2a7dc6338cd78cc13787eade` 归档快照。复核任务指定的四组 Git 差异、集成接线、原型确认范围及实施记录。核对 `t11` 对应本机 Core 的 `review-1`、`HC_TERMINAL_ID=t11` 和当前 manifest 行。审查期间业务快照保持只读。定向探针使用临时 Vault、合成字段和回环服务，脚本和输出保存在 [独立审查证据目录](/tmp/huhu-t11-review.k9yRIY)。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| #9 系统保护、弱回退、密文与注入点 | 锁定依赖 2.1.2 的显式 `secret-service` 选择只走 Secret Service。系统服务不可用会映射至 `unavailable`，没有 keyutils 或明文备援。同一 key ID 已存在时拒绝覆盖，Kernel 新密钥用随机 ID，系统存储错误和缺键与显式重配分开处理。Linux 原生和故障夹具在集成日志 2 通过、4 跳过。HTTP、CLI、MCP、env 及 renderer 均没有替换保护器的装配入口。环境变量传递的是本机应用数据路径。 | `apps/engine/src/module-credential-host.ts:15`、`:35`、`:61`；`apps/engine/src/main.ts:86`；`packages/kernel/src/credentials/versions.ts:141`；`packages/kernel/src/credentials/module-credentials.ts:231`；[keyring 2.1.2 实现](https://github.com/Brooooooklyn/keyring-node/blob/v2.1.2/src/entry_builder.rs)；[Secret Service 锁定合同](https://specifications.freedesktop.org/secret-service/latest/unlocking.html) |
| #9 打包依赖与解包 | 独立 Linux x64 electron-builder `--dir` 打包成功。GNU 绑定的 ASAR 条目标记为解包，文件实际写入 `app.asar.unpacked`，同目录含上游依赖许可文件。打包的 Electron 44.9.1 从 `app.asar` 内的 JS 包装器加载该原生绑定，在隔离 Secret Service 写入、回读、删除并确认合成键消失。AppImage、deb 与其他平台安装包待核验。 | [Linux 打包日志](/tmp/huhu-t11-review.k9yRIY/pack-linux.log) · [归档加载探针](/tmp/huhu-t11-review.k9yRIY/pack-native.log) · [解包条目探针](/tmp/huhu-t11-review.k9yRIY/pack-native-unpacked.log) · [electron-builder v26 解包配置](https://www.electron.build/v26/docs/configuration/) |
| #7 默认关闭、逐项授权、读写边界 | 五项描述符默认关闭。Dispatcher 每次检查最新工具策略，再进业务 handler。路由版本覆盖跳点和认证修订。只读主机摘要读可移植定义，作业状态与输出查内存或回执，均无凭据取用或主动拨号。HTTP MCP 夹具用独立令牌验证错主体、撤权及取消。CLI 测试验证旧路由、错 session、复制回执跨 Vault 拒绝。 | `plugins/ssh/src/engine/capabilities.ts:47`、`:56`；`packages/kernel/src/dispatcher.ts:190`；`plugins/ssh/src/engine/public-resources.ts:35`、`:67`；`plugins/ssh/test/public-resources.engine.test.ts:373`、`:471`、`:541` |
| #7 作业生命周期、回执及输出 | 同意图先查并持久记录，再拨号与一次 Exec。5 秒接收超时与中断回执返回待核实，重复提交不再执行。取消定位原 job，只根据服务端报告确认退出。读取关闭不直接影响 SSH，独立的 Engine 空闲退出问题见发现。stdout 与 stderr 各保留 64 KiB，UTF-8 解码后计字节，游标避开续字节。终态、启动过期和关闭通过连接所有者回收。 | `plugins/ssh/src/engine/public-jobs.ts:116`、`:182`、`:250`、`:295`；`plugins/ssh/src/engine/job-output.ts:15`；`plugins/ssh/src/engine/manager.ts:192`；[独立无界面探针](/tmp/huhu-t11-review.k9yRIY/ssh-headless.log) |
| #8 内容、确认和草稿 | 工作台只提交选择框确认的片段、操作及可选用户问题。目的地显示经同一规范化函数生成，Engine 只发给这一地址并拒绝重定向。确认绑定当前 Mail 插件实例、Workbench 主体及保存修订，发送前同步消费。结果以 React 文本显示，采纳先执行 prepareReply，再在编辑器创建文字段落，无自动发信。静态五项与 manifest 和运行绑定一致。 | `plugins/mail/src/ui/MailAiAssistant.tsx:77`、`:85`、`:184`；`plugins/mail/src/engine/ai-settings.ts:260`、`:283`；`plugins/mail/src/engine/ai-transport.ts:33`；`plugins/mail/src/ui/MailReader.tsx:251`；`plugins/mail/src/ui/MailModule.tsx:61`；`apps/engine/src/boot.ts:137`、`:242` |
| #8 设置和持久化 | 独立 owner 为 `mail.ai`。正常 Key 字段经 ModuleCredentials 保护，机密数据不在 Vault 内，备份包含可移植设置。集成 Linux 全量跳过 Windows 专用的两项 Mail AI Engine 验收。本轮以真实 HTTP 入口、进程内测试保护器及 HTTPS 回环夹具复现了可移植字段泄漏。 | `plugins/mail/src/engine/ai-settings.ts:9`、`:162`；`plugins/mail/test/ai-settings-engine.test.ts:101`；[独立 Key 探针](/tmp/huhu-t11-review.k9yRIY/mail-key.log) |
| Vault 同步发布、独占创建和回滚 | 在授权回调的同一事件循环轮次发布。实测硬链接冲突和模拟 EPERM 的原生不覆盖改名回退，均返回 `NAME_CONFLICT` 并保留既有目标。成功时保留回执，发布前失败时撤销。回退目标保留记入 `creationStage` 的文件身份。OperationLog 当前调用异步路径，恢复按 inode 与版本处理。独立故障探针覆盖了成功发布后的清理失败。 | `packages/vault/src/write.ts:125`、`:165`、`:206`；`packages/vault/src/operations.ts:122`、`:176`、`:254`；[同步发布探针](/tmp/huhu-t11-review.k9yRIY/vault-probe.log) · [清理故障探针](/tmp/huhu-t11-review.k9yRIY/vault-cleanup.log) |
| CSS 与路径过滤 | 主应用 JSX/CSS 中 `grow` 类及 SSH 行选择器已配对改名。新类保留 `flex:1` 和 `min-width:0`。守卫按相对路径加平台分隔符识别完整 `ok` 路径段。Lead 的候选构建两个桌面资产都为 A/B/C 0。 | `packages/ui/src/styles/components/storage-etc.css:99`；`plugins/ssh/src/ui/ssh.css:331`；`scripts/check-ok-class-collisions.mjs:195`；[候选构建日志](/home/wta/projects/huhu/temp/issue-baseline/linux-22e91432-build.log) |
| #8 桌面与 Web 实际界面 | 在临时归档配置 Xvfb、X11 和隔离 Secret Service 后，Electron 44.9.1 / Chromium 152 两项现有 Mail AI E2E 通过。独立 Chromium 158 经真实 Web 邀请通过选区、未确认零请求、失败后重试、按文本显示以及采纳编辑、保存草稿和空发件箱验证。浏览器设置显示需到 Engine 桌面修改。 | [Mail 桌面 E2E](/tmp/huhu-t11-review.k9yRIY/e2e-mail.log) · [Mail Web E2E](/tmp/huhu-t11-review.k9yRIY/e2e-mail-web.log) |
| 固定候选全量测试 | Lead 日志为 1616 通过、61 跳过。SSH public resources 9 项通过，Vault Operations 23 项通过。本审查另完成表中的定向探针及界面验证。 | [候选测试日志](/home/wta/projects/huhu/temp/issue-baseline/linux-22e91432-test.log) |

Modern Web Guidance 检索并读取了 `privacy`、`security` 与 `dialog`，对照数据最小化、纯文本及确认对话框行为。本轮为只读审查，未应用代码更改。Mail 原型采用已确认的指纹，S7.2 实施记录提供 Windows Electron 44.9.1 / Chromium 152 的实际界面证据。Lead 的 Linux 完整 E2E 记录 368 失败、19 跳过，首个失败在 Wayland 初始化，未启动应用。独立验证在 Xvfb 中选择 X11，已跑通上述两端的 Mail AI 定向用例。完整 E2E 尚未在修正的显示环境重跑。 [Mail 原型确认记录](/home/wta/projects/huhu/temp/issue-snapshots/22e91432/.agents/dev/changes/2026-11-19-issue-8-mail-module/prototype-review.md) · [候选完整 E2E 日志](/home/wta/projects/huhu/temp/issue-baseline/linux-22e91432-e2e.log) · [Windows 实施证据](/home/wta/projects/huhu/temp/issue-snapshots/22e91432/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence-S7.2-mail-ai-selection.md)

## 阻碍与接续

审查已完成。按以上合入结论处理确认项与验收缺口后，在同一修订上复核。公共 Shell、SFTP 和传输仍是既有后续切片，不能据本轮 Exec 证据签收完整 A13。

## Lead 验收

待 Lead 验收。

Lead 验收（2026-11-21）：通过，发现均可复核。处置：
- #9 P0.1：可合入（已在集成）；台账三平台用途已由 Lead 在 `5021f54c` 补齐；macOS/Windows 包内实测列为平台未测项。
- #7 H11.2 CLI 自启动无凭据宿主（P1）与空闲退出（P2）→ t10/task02。HTTP MCP 会话身份（P1）→ #6 会话身份切片（待派）。
- #8 Mail AI 停用保存泄露 Key（P1）→ t6/task03；`mail-ai-settings` 事件映射（P3）已由 Lead 在 `5021f54c` 修复；外部可选开放（P2）→ #6 能力开放切片（待派）。
- 主线合并 write.ts 暂存清理（P2）与台账 R-54/R-71（P3）已由 Lead 在 `5021f54c` 修复并补先红后绿的回归。
修复交回后由新一轮独立审查复核受影响范围。
