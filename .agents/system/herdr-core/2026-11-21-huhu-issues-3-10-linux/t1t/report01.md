# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t1t
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1t/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1t/report01.md
- 执行结果 — done

## 结论

在集成快照 `fc048b6b` 复核指定的七个提交。发现两项 P2，分别是系统钥匙串不可读时 Mail AI 仍可写入未经校验的便携字段，以及 Vault 在延迟清理时未核对暂存文件身份。另有两项 P3 行为问题和一项 P3 包边界违规。优先处理 P2。

| 提交 | 规格轴 | 规范轴 | 范围 |
| --- | --- | --- | --- |
| `6f30ffa8` / `b838fcd9` | 通过 | 通过 | 40 项便携测试的断言与注入边界 |
| `2a170094` / `7344d3e5` | 有缺陷，P3 | 通过 | Linux 受控 Codex、路径与原生回执 |
| `f70f1a44` / `4a9a7305` | 通过 | 有缺陷，P3 | CLI 自启动凭据、SSH 保活与清理 |
| `decfca90` | 通过 | 通过 | 私有 Git 环境清理、真实 HTTPS 与取消 |
| `cccaf2ea` | 有缺陷，P2 | 通过 | Mail AI 便携字段，含钥匙串故障 |
| `5021f54c` | 有缺陷，P2 | 通过 | Vault 延迟清理。缓存和上游台账通过 |
| `f7901b0a` | 通过 | 通过 | Mail AI 选区用例与已确认的外部工具决定 |
| `fc048b6b` | 有缺陷，P3 | 通过 | Core 启动边界通过，诊断可能误报健康 |

### 规格缺陷

- **P2 · `cccaf2ea` · 系统钥匙串不可读时仍允许改写未经校验的字段。** `plugins/mail/src/engine/ai-settings.ts:205`、`:218`、`:233`、`:243`。停用保存且保留当前 Key 时，读取失败可被吞掉，随后会保存此次输入的 model。当前 Key 若误填进 model，保存结果、普通设置读取和 Vault 导出都会包含它。Kernel 的 keep 分支复用既有引用并发布新的 definition，因此无需成功解密便可提交。现有不可用测试以原 model 保存，只验到纯停用可完成。建议在旧 Key 已配置但不可读时，仅允许保持原便携字段的停用等可安全完成的编辑。此项为代码确认，未运行含 Key 的故障变体。 [原始保密约定](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/source.md#L233) · `packages/kernel/src/credentials/module-credentials.ts:223–257` · `plugins/mail/test/ai-settings-engine.test.ts:103–121`。
- **P2 · `5021f54c` · 延迟重试可能删除已经替换的同路径文件。** `packages/vault/src/write.ts:199–205`、`:250–255`、`:268–279`。发布成功、首次清理失败后，重试只持有绝对路径。若外部同步程序在延迟窗口替换暂存条目，或替换父目录后在同路径写入其他文件，后续 `rm` 会删除新条目。现有事务清理核对文件身份后才删除，延迟分支可复用同一约束。持续故障超过五次还会留下硬链接，内存登记只过滤监听器，整库包收集与 Git 同步仍可选中部分范围内的残留条目。建议保存文件身份并在每次删除前复查，验证持久故障及路径替换。此项为代码确认，已通过的故障夹具只注入一次删除失败。 `packages/vault/src/operations.ts:173–185`、`packages/vault/src/package/package.ts:32–47`、`plugins/versioning/src/engine/sync.ts:82–88`、`packages/vault/test/operations.test.ts:76–109`。
- **P3 · `2a170094` · Linux 路径比较沿用了大小写折叠。** `plugins/agent-cli/src/engine/codex-dispatch.ts:126–140`。在区分大小写的文件系统上，合法的私有 provider 目录若与默认历史目录只有大小写不同，即使 `realpath` 和目录身份不同，也会在探测版本前被判为同一目录并拒绝派遣。按实际文件系统和平台语义核对相等、父子关系与别名。此项为代码确认，原生用例使用差异明显的两个目录。
- **P3 · `fc048b6b` · Core 文件存在但不可运行时误报健康。** `plugins/agent-cli/src/engine/herdr-core.ts:125–129`、`apps/engine/src/boot.ts:395–401`。Core 停止时，配置路径若指向目录或丢失可执行权限的文件，`probe` 仍返回 idle，诊断显示正常，工作台实际启动在 spawn 阶段失败。复用同插件的文件类型和 POSIX 执行权限检查即可保持诊断只读。此项为代码确认，现有定向用例只区分可执行脚本和缺失文件。 `plugins/agent-cli/src/engine/detect.ts:23–29`、`plugins/agent-cli/test/sessions.test.ts:106–122`。

### 规范缺陷

- **P3 · `f70f1a44` · Engine 从 SSH 插件内部的深路径导入保活绑定。** `apps/engine/src/boot.ts:65`、`:461–466`。同一装配经 `@huhu/plugin-ssh/engine` 调用 `apply`，保活则经相对路径访问 `public-jobs` 的模块私有 WeakMap。相对写法避开 `oxlint.json:14–24` 按包名匹配的入口检查。插件的公开入口已带 Exec 配置，可沿它显式传入保活回调，让所有权和释放顺序随现有插件生命周期。 `.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/engineering.md:61–66` · `plugins/ssh/package.json:7–12`。

## 产物与改动

审查基准为 `22e91432`，目标为 `fc048b6bbf56b187561b2457c38b0f4b3d21b1a7`。按提交读差异，并核对三次合并的第一父差异和最终调用链。对差异中的 63 个路径逐一比较当前归档与 Git blob 哈希，全部一致。安装依赖后业务文件保持归档内容。产物是本报告。

## 验证

### 逐提交核对

- **`6f30ffa8`。** 核对了 14 个测试文件的差异。Safe 三项只拿掉平台门槛，原操作走真实服务入口。Mail、SSH、Git 和 Agent 启动环境主要用进程内 `TestProtection` 替换系统钥匙串，保留模块加密、授权、恢复与实际网络断言。HTTPS Git 改用共享证书，保留真实 fetch/push。Agent 专项由原生钥匙串改为便携后端，通用原生往返另由 `apps/engine/test/module-credential-host.test.ts:31` 覆盖。三项保留 Windows 的批准用例依赖 PowerShell 和对应的真实受保护启动宿主，Git 专项的暂留已由 `decfca90` 解除。注入点只存在于进程内 `boot` 选项。生产 main 只传用户数据路径，HTTP、CLI、MCP 与 renderer 的调用或 IPC 没有选择保护器的参数。 [40 项原始回归](../t6/report02.md) · [后续修复](../t6/report03.md) · `apps/engine/src/boot.ts:89,154`、`apps/engine/src/main.ts:86–94`、`plugins/automations/src/engine/terminal-environment.ts:219`。
- **`2a170094`。** Linux x64 在运行版本探针和 helper 启动两处校验 Codex ELF 指纹。Unix socket 在私有临时目录中，地址进入签名 thread 回执。Engine 核对 attempt、地址、原 PID 与原 thread，之后校验挑战和回执。真实 Codex 回环 Responses 测试观察到同一 call ID 的答复、两次请求和一个最终结果。三项原生回执测试实际确认 `agent_received` 与 `tasks_consumed` 双 ACK 丢失后对账，原 provider 只收一次输入，以及重启后按原请求证据确认先前暂不明确的答复。helper 使用私有 HOME/CODEX_HOME 和 ephemeral thread，本次原生测试用隔离目录与合成 provider。待验为 macOS/Windows 与 Linux 某些安装入口。尤其 `configured` 也接受 darwin，实际会走原 Windows 版本字符串分支且不启用原生选项桥，现有 Linux 证据不足以签收 macOS。Linux arm64 的真实受控路径仍被 x64 指纹门槛挡住。 `plugins/agent-cli/src/engine/codex-dispatch.ts:106–169,199–252,300–318`、`plugins/agent-cli/src/engine/codex-dispatch-helper.cjs:82–105,438–455,475–489`。
- **`f70f1a44`。** CLI 仅在启动无运行实例的 Engine 时推导桌面 userData。原宿主核对应用资料目录在 Vault 外，绑定 Vault ID、设备、inode 与出生时间，凭据 owner 再按插件及目标隔离。Engine 每次处理工具调用仍使用当前授权。#6 规格第 24 行明确保留已受理作业，撤权后按最新策略拒绝不再获准的调用。插件停用及 Engine 显式关闭经 SSH `dispose` 清理原作业和连接。保活登记在受理后持有，终态和处置通过 finally 释放，空闲阈值从最后一次释放计算。连接处置后的远端退出仍以设备回报为准。待验为 Windows、macOS 的桌面路径与安装版 CLI。 [前序构建产物实测](../t10/report02.md) · [普通与 Safe 锁定日志](/tmp/huhu-t10-task02.AQR6PM/test.log) · `apps/cli/src/connect.ts:46–90`、`apps/engine/src/module-credential-host.ts:61–75`、`apps/engine/src/main.ts:116–138`、`plugins/ssh/src/engine/index.ts:67–76`、`plugins/ssh/src/engine/public-jobs.ts:169–188,309–335,359–368`。
- **`decfca90`。** POSIX 和 Windows 共用 scrub 与 Git 参数，原环境 trace、旧 askpass 与代理设置由明确参数清理或者覆盖。远端按协议、主机、端口和仓库约束，Git 使用禁重定向及仅允许约定协议的参数。Linux 回环 HTTPS 实测 fetch/push 成功，trace 未创建，取消关闭传输连接，启动器文件被清理，后续取回成功。测试明确容许 POSIX askpass 的两项专用子进程变量，验证 argv、启动器文件与错误无合成凭据。macOS/Windows 未独立复验，异常忽略终止信号的 Git 实现也未验。 `plugins/versioning/src/engine/askpass.ts:45–73`、`git.ts:35–70,101–136`、`sync.ts:279–295,318–345`。
- **`cccaf2ea`。** 可读取 Key 时，保留、替换、清除及停用保存均检查旧 Key，替换还检查新 Key，验证请求和便携字段检查各有条件。真实 HTTP 回归涵盖当前 Key 拒绝、原设置保全、停用不额外请求、ZIP 和恢复。Key 不可读时的字段修改缺口见 P2。既有数据中的历史误存没有迁移证据。 `plugins/mail/test/ai-settings-engine.test.ts:103–151`。
- **`5021f54c`。** 同步与异步独占创建在成功硬链接后保持发布结果与回执，单次清理失败时两种路径均可后台清掉原条目。持续故障和身份变化见 P2。Mail AI 事件确实让同 Vault 的 `mail.ai.getSettings` 查询失效，其他 Vault 和邮件列表键不失效。台账及 notices 均将 OK 条目指向 R-71，SSH 导入保持 R-54，三平台运行的钥匙串依赖已登记。 `packages/workbench/test/engine-client.test.ts:105–114`、`docs/upstream/ledger.md:23,40,47,60`、`THIRD_PARTY_NOTICES.md:134,151,158,171`。
- **`f7901b0a`。** 真实 Engine 和回环服务测到无确认时零请求、一次确认、拒绝重放、Vault 切换、目的地变化、取消、原文本返回及空发件箱和草稿列表。补充决定要求外部调用只创建待确认请求，经桌面或 Web 人工批准后发送，管理操作保留工作台。现有拒绝外露的断言只覆盖当前切片，外部批准流程仍待 #6/#8 交付。 `plugins/mail/test/ai-selection-engine.test.ts:71–185`、`.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md:19–26`。
- **`fc048b6b`。** `health.run` 通过 `probe` 只查现有端点。布局 handler 根据已认证的 Workbench caller 决定恢复时能否启动，外部调用已有布局而 Core 停止时得 `HERDR_UNAVAILABLE`。现况下该布局能力的外露目录标记仍为 false。定向测试确认 probe 与外部读分支未运行启动脚本，也用实际 Core 核对重开 Engine 后，工作台能读取已有布局。Core 已停止时由工作台主动拉起的分支，以及健康 HTTP handler 的接线，均按源码核对。Windows 空端点路径与异常二进制待验。 `apps/engine/src/boot.ts:389–402`、`plugins/agent-cli/src/engine/herdr-core.ts:98–140`、`plugins/agent-cli/src/engine/workspace-layout.ts:203–214`。

### 本轮实跑

最终定向结果为 18 项通过。Linux x64，Node 24.21.0，pnpm 12.10.1，Vitest 3.2.7，Git 2.53.0。每次 Vitest 只跑下列单文件，并设独立的 `XDG_RUNTIME_DIR`。先用 `pnpm install --frozen-lockfile --prefer-offline` 安装，默认运行目录的操作锁因只读失败。将该目录和 pnpm store 放在临时位置后，同一冻结锁安装完成，退出 0。已跑 `git diff --check 22e91432..fc048b6b`，退出 0。原生夹具使用只读的 Herdr Core 0.1.19 和 Codex ELF 0.170.0，SHA-256 均与实施证据一致。测试以最新快照运行，以下跳过数含名称筛选。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| Core 只读与工作台恢复 | `pnpm exec vitest run --maxWorkers=1 plugins/agent-cli/test/sessions.test.ts -t '只读诊断与外部布局读取'`，1 通过、28 筛选跳过。 `pnpm exec vitest run --maxWorkers=1 apps/engine/test/agent-workspace.test.ts -t '恢复 Space'`，1 通过、2 筛选跳过。 | `sessions.test.ts:106`、`agent-workspace.test.ts:15` |
| Vault 发布及保留回执 | `pnpm exec vitest run --maxWorkers=1 packages/vault/test/operations.test.ts -t '独占创建'`，3 通过、22 筛选跳过。 | `operations.test.ts:63,76` |
| Mail 选区及 Key | `pnpm exec vitest run --maxWorkers=1 plugins/mail/test/ai-selection-engine.test.ts` 与 `pnpm exec vitest run --maxWorkers=1 plugins/mail/test/ai-settings-engine.test.ts`，各 1 通过。 | 两个测试文件 |
| #4 原生 Codex 和持久 ACK | `pnpm exec vitest run --maxWorkers=1 plugins/agent-cli/test/codex-native.live.test.ts` 与 `pnpm exec vitest run --maxWorkers=1 plugins/agent-cli/test/native-receipts.live.test.ts`，分别 1 和 3 通过。三项回执用例观察到原输入只消费一次、双 ACK 恢复、实际入口交叉派遣和答复、重启后按原证据对账。 | `codex-native.live.test.ts:75–97`、`native-receipts.live.test.ts:64,260,443` |
| POSIX Git 与便携凭据 | `pnpm exec vitest run --maxWorkers=1 plugins/versioning/test/remote-auth.engine.test.ts -t 'HTTPS 认证绑定协议与主机'` 与 `pnpm exec vitest run --maxWorkers=1 apps/engine/test/module-credential-host.test.ts -t 'Agent 启动环境'`，各 1 通过、5 筛选跳过。 | `remote-auth.engine.test.ts:433–530`、`module-credential-host.test.ts:164` |
| 同 Vault 查询失效 | `pnpm exec vitest run --maxWorkers=1 packages/workbench/test/engine-client.test.ts -t mail-ai-settings`，1 通过、10 筛选跳过。 | `engine-client.test.ts:105` |
| SSH 授权、取消与重启对账 | `pnpm exec vitest run --maxWorkers=1 plugins/ssh/test/public-resources.engine.test.ts -t 'MCP HTTP rechecks|admission left'`，2 通过、7 筛选跳过。验证授权重检、只取消原作业，以及重启后保留原回执。 | `public-resources.engine.test.ts:471,636` |
| SSH CLI 自启动与空闲退出 | `HUHU_HEADLESS_SECRET_SERVICE_TEST=1 ./node_modules/.bin/vitest run --maxWorkers=1 apps/cli/test/headless-engine.test.ts`。默认私有 D-Bus 两项在桌面保存合成凭据阶段报 `SSH_AUTH_FAILED`，CLI 尚未启动。按前序证据改用只作用于本次临时总线的 D-Bus 配置，合成项写入、读取和删除预检通过。之后同一快照从源码启动 CLI 与 Engine，两项通过，锁定 Safe 时原 PID 跨过空闲阈值，并在作业完成后退出。 | `headless-engine.test.ts:23,96,143–170` · [隔离钥匙串配置依据](../../../../dev/changes/2026-11-19-issue-7-ssh-module/verification/headless-engine-credentials-linux.md#复跑) |

Modern Web Guidance 检索了客户端查询失效主题并获取了 `js` 指南。该差异只补充 React Query 的实体映射，未引入 Web API。两端的共享键与事件映射用定向测试验证，本轮无浏览器或安装包复验。全量测试、E2E 及构建均未运行。

## 阻碍与接续

本轮审查已完成。已确认缺陷与待验平台见上文。提交范围内保留的 #6 会话身份与 Mail AI 外部批准仍须由所对应切片交付。

## Lead 验收

待 Lead 验收。

Lead 验收（2026-11-22）：通过。处置——P2 `5021f54c` 延迟清理核对 dev/ino 并在包收集排除 `.huhu-create-` 残留：`5a68a66f`（Git 同步侧的同类排除待 t1z 的 sync.ts 改动合入后由 Lead 补）；P2 `cccaf2ea`：`5d322392`；P3 `2a170094`：`c50c53a5`（原生用例红→绿）；P3 `fc048b6b` probe 可执行检查：`5a68a66f`；P3 `f70f1a44` 深路径导入：待 t1k/t1y 的 `public-jobs.ts` 改动合入后由 Lead 改为经 `ssh.apply` 的 execJobs 选项传入。终端 t1t 已关闭。
