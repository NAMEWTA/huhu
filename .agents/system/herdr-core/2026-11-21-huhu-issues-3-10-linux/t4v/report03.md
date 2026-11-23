# #8、#9 模块凭据与第二组联验复核

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t4v
- 实际执行终端 — t4v，wta-ubuntu 默认 Core
- task — task03.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/task03.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/report03.md
- 执行结果 — done（只读复核及验收准备完成）

## 结论

**第二组联验在 Linux 有可串联的路径。** 用同一候选的 CLI 和 HTTP MCP 验默认关闭、逐项授权与撤销。Safe 锁定后，用 Mail 的密码账号执行一次真正的回环 IMAP 刷新。整 Vault 数据包从桌面「设置 → 数据与存储」导出并导入新目录，重开后分别核对 Safe、Mail 持久数据和机器认证状态。SSH 的工作台 HTTP 回环可代替 Mail 认证段，覆盖 Safe 未初始化、锁定和停用三态。

**CLI/MCP 的包导出在本候选会漏掉模块可移植定义。** 此路径可导出 Mail 草稿与附件，却遗漏恢复这些数据所需的 Mail 账号定义，SSH 主机定义也会缺失。另一个缺口在整包导入只校验归档清单，未在发布目录前核验 Safe 的必需 keyring 或 Mail 已引用的附件。下表给出范围和可复验证据。正向联验应选桌面整包路径，并保留缺件验收行。

## 审查范围

固定 Git 对象为 `a8bcd14550ae61380d9e5d49904bfb8122ed5789`。在 integration 工作树仅用 `git show/grep/diff` 读取固定提交，正在修改的 #7 文件未纳入。对照批次 `program.md` 的第二组联验、#8 的原文 §5.3、§8.2、§9 与 S6a.2/S6b.1/S9.1、#9 的原文 B03–B05、C01–C06、D01–D05 与 P8/P10，以及 #6 共同策略。沿用既有原型确认和 2026-11-21 对 Mail AI 人工批准的决定。先前 Mail 开放 `e6fe4f5b`、Mail/Safe `cd0ea9c4` 和返工至 `82f0d188`、Safe Git `2c7994d3`、Kernel 包动作 `9f4f72ca` 均已进入本候选。后续 Engine 变更涉及其他功能，固定 SHA 仍缺同一旅程实跑。

## 实现问题与最小验证

| 定性 | 固定提交的证据 | 仅用合成夹具的验证与修正范围 |
| --- | --- | --- |
| **P1 · 外部整包会漏恢复所需的账号/主机定义** | `packages/kernel/src/credentials/module-credentials.ts:69,98–121` 将可移植定义放在 `.huhu/module-credentials/`，其中 Mail 账号与 SSH 主机分别由 `plugins/mail/src/engine/accounts.ts:43–50`、`plugins/ssh/src/engine/host-configurations.ts:101` 拥有。 `packages/vault/src/paths.ts:7–18` 将 `.huhu` 标为受保护。外部 `vault.exportPackage` 在 `packages/kernel/src/capabilities/package.ts:111–123` 允许普通资料及少数受管目录，其中含 `.huhu/safe/`、`.huhu/mail/`，没有这两种可移植定义。正常桌面导出经过 `apps/engine/src/boot.ts:199–219` 的 Safe/Mail 快照与收录规则，会保留定义。外部模式的成功回执与 ZIP 哈希不证明 Mail/Safe/SSH 的同等恢复范围。 | 在临时 Vault 新建一个合成 Mail 或 SSH 定义，选用 `packages/kernel/test/kernel-exposure.test.ts:542` 的同一主体包 ID、摘要、恢复 ID 夹具，分别从已授权外部入口和桌面导出，比较只含合成资料的清单、导入后的账号/主机列表及原 ID。若该外部动作继续提供同样的整 Vault 合同，须显式收录经过领域判定的可移植定义，仍排除本机密文和钥匙。若外部动作按现有实现定义为子集，目录和回执应明确省略范围。本轮正向联验用桌面整包。 |
| **P2 · 整包导入成功不等于 Safe/Mail 领域完整** | `packages/vault/src/package/package.ts:131–189` 验证 ZIP、清单中的文件、路径及 SHA；唯一必需业务路径是 `.huhu/vault.json`，随后将暂存目录发布。`packages/kernel/src/capabilities/package.ts:143–171` 和桌面启动页的 `apps/desktop/src/main/vault-session.ts:51–61` 共用这个导入器。含 Safe 清单但整包未声明 keyring 时可返回导入成功，打开后 `plugins/safe/src/engine/store.ts:224–233` 才报损坏。Mail 的整包**导出**会校验草稿、发件记录和被引用的附件（`plugins/mail/src/engine/drafts.ts:90–115`），整包**导入**无对应语义检查。子集预检已有缺附件提示（`MailSubsetSettings.tsx:189`），不能作为整包证据。 | 基于 `packages/vault/test/package.test.ts` 的新格式合成夹具，分别提供缺 keyring、缺已引用附件且文件清单自身一致的样例；区分缺件与普通哈希不符。复用 `apps/engine/test/engine.test.ts:1248` 和 `plugins/mail/test/draft-attachments-engine.test.ts:88` 的实际入口断言。应在发布前核验必要领域对象，对明确的范围省略报告可恢复部分/待重绑；目标非空继续拒绝并保持原数据。主密码不对属于重开后的解锁结果。 |

另有入口差异影响证据。设置中的 `vault.importPackage` 在源 Vault 仍打开、ID 相同的情况下给副本新 ID。启动页的 `vault-session.ts:56` 未传已打开 ID 或 regenerateId，会保留包内 ID。即使 ID 一样，`apps/engine/src/module-credential-host.ts:70–76` 还按目录实例隔离本机认证。S6a.2/P8.2 指定新 ID 的验证，应从源 Vault 的「数据与存储」导入。桌面整包保留 `.huhu/gateway/tool-access.json`，但排除 `gateways.json` 和运行态。恢复的 Vault 按备份策略读回，不能代替干净安装的默认关闭验证；导入后应比对归档时的选择、原凭据/逻辑会话是否失效。相关源码为 `packages/vault/src/package/package.ts:25–31`、`packages/kernel/src/exposure.ts:31–56` 和 `apps/engine/src/boot.ts:231–238`。

## 同一候选的最短验收顺序

1. **创建临时 Vault/临时应用资料，先看默认。** 在桌面能力网关查 `mail.accounts.list`、`mail.sync.refresh`、`safe.accounts.reveal` 未开放。MCP 可由工作台仅启动服务并发该测试的令牌，服务启动本身不选择业务工具。CLI `capabilities list` 与 HTTP MCP `tools/list` 均不见这些动作，直接以旧名字调用也得 `CAPABILITY_NOT_EXPOSED`。逐项开启 Mail 读取与刷新，保持 Safe 敏感读取未授权。入口和矩阵可复用 `plugins/mail/test/tool-exposure.test.ts:79–109,190–238,252–317`。合成密码实际通过 CLI 输入时使用 `--input-file -` 读 stdin。
2. **锁 Safe 并做真实认证。** 桌面新增 Mail 合成邮箱，通过回环 IMAP 测试、发现并保存 INBOX。Safe 另建一个独立个人条目，建议直接使用三合成账号与标签夹具。锁定后记录 `initialized:true, locked:true`。借用 Mail 授权矩阵，以新请求和账号修订做一次 CLI、一次 HTTP MCP 实际刷新，确认 IMAP 有新认证与收件记录，确保结果不来自重交回执或旧缓存。OAuth 的替代验证见 `oauth-engine.test.ts:475–498`，其中 Safe 锁定后经真实回环 XOAUTH2 读取。选 SSH 时改用 `host-auth.engine.test.ts:153–219` 和 `public-resources.engine.test.ts:660–777,1307–1368`，预先从工作台授权正确主机与路由，观察原 attempt、指纹待答及真实认证。
3. **撤销同一动作，保留模块内使用。** 从工作台关闭 `mail.sync.refresh`，同一外部会话重新发现时该动作消失，直接调用旧工具名也拒绝。夹具比对认证/任务计数；再用工作台带新输入刷新成功，Safe 仍然锁定。复用 `tool-exposure.test.ts:208–238` 的零副作用检查；Safe 显式读取单独复验 `plugins/safe/test/external.engine.test.ts` 的锁定、旧代和在途撤权。SSH 另区分工具选择撤销和主机授权撤销，不把后者当成前者。
4. **同一源 Vault 导出、恢复、再打开。** 可先保存一份含受管附件的草稿，并让独立 SMTP 夹具产生可核对的一笔 accepted 或 unknown 记录。保持 Safe 锁定，通过 `packages/workbench/src/settings/StoragePage.tsx:112–124` 的桌面导出/导入，保留 SHA、文件清单、源/目标 Vault ID。只在所用临时目录查验 ZIP 与目标的三个不变量：有效 Safe 密文、实际引用的 Mail 字节与非秘密定义被保留；机器认证钥匙、runtime、令牌状态和合成秘密字节不出现；重开前后无自动 SMTP DATA。目标 Safe 先锁定，之后用快照对应的主密码解锁，核对三账号每个字段及标签。Mail 或 SSH 原 ID 仍在，但机器认证要求重新配置，未复配前不能认证成功；只在所属模块重填合成认证后重试。沿用 `apps/engine/test/engine.test.ts:1248–1354` 的真实包能力夹具，复用 Mail 附件/发件读回及 `host-auth.engine.test.ts:199–219` 的不继承绑定断言。P8.2 另补改密前后各一份、各自密码打开及缺件拒绝。

## 固定候选命令选择

下列为后续串行选择，本轮未执行。先用临时 Vault/应用资料、完整回环监听权限与 Node 24.21.0、pnpm 12.10.1。本机保护与协议证据分开；使用 `TestProtection` 的套件无需实际钥匙串，真实平台套件需隔离 Secret Service 等系统后端。某个真实钥匙串用例跳过时记录原因。

```sh
pnpm exec vitest run plugins/mail/test/tool-exposure.test.ts -t 'Mail 静态目录完整|Mail 逐项默认关'
pnpm exec vitest run plugins/mail/test/oauth-engine.test.ts -t 'OAuth uses the real dispatcher'
pnpm exec vitest run plugins/ssh/test/host-auth.engine.test.ts -t 'SSH 自有密码在 Safe 三种状态'
pnpm exec vitest run plugins/safe/test/external.engine.test.ts
pnpm exec vitest run apps/engine/test/engine.test.ts -t 'ACC-SY-08'
pnpm exec vitest run plugins/mail/test/draft-attachments-engine.test.ts -t '整库备份不会发布|只读 Engine 不能发布'
pnpm exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Mail ZIP 预检拒绝覆盖'
pnpm exec vitest run apps/engine/test/module-credential-host.test.ts -t '系统钥匙串中的模块凭据'
```

- **补足界面和安装版。** 桌面/浏览器已有 `pnpm e2e tests/e2e/workflows/mail.spec.ts tests/e2e/workflows/safe-tags.spec.ts`。同版可补 `pnpm e2e tests/e2e/ssh/entry-parity.spec.ts`，它串联认证更新、信任、文件、作业和撤权，未预置 Safe 锁定或整包恢复。E2E 需实际候选构建、明确 Chromium 路径和隔离的桌面资料/钥匙串。现有 packaged 冒烟 `tests/e2e/packaged/packaged.spec.ts:78–100` 只通过桌面真实能力创建资料并导出 ZIP；安装版的组合路径需沿用其 `HUHU_PACKAGED_EXE` 入口补回读。现成测试的源 Vault 彼此独立，同 SHA 串行复跑用于分段证据。要观察同一个 Vault 从授权走到恢复，建议抽取上述矩阵最少两项 Mail 工具、一个 Safe 条目和包能力夹具，接成一条临时 Vault 集成用例。
- **外部包缺口验证。** `pnpm exec vitest run packages/kernel/test/kernel-exposure.test.ts -t '包导出不接受 Engine 路径'` 是现有边界选择，原断言只覆盖普通对象、摘要、范围和目标冲突，未带模块账号。另可复用 `packages/vault/test/package.test.ts` 补有清单但缺领域对象的样例。

## 已验证与仍缺证据

| 范围 | 可引用结果与边界 |
| --- | --- |
| CLI/HTTP MCP、Mail | [t2r/report02.md](../t2r/report02.md) 记录集成 `fc044713` 上 Mail 15 文件 60 项通过，含真实 CLI/HTTP MCP 与回环夹具。早期 G-Mail 日志的 EPERM 属于此前运行。`tool-exposure.test.ts:537–541` 的 ZIP 使用 Vault 库直接导入做脱敏扫描，未走组合包 handler，且未核对目标账号恢复或 Safe 锁定。t33 Lead 上的 39 文件 365 过、3 跳，以及 Mail E2E 8/8、Safe 标签 3/3 属于 `cd0ea9c4` 至 `82f0d188` 返工阶段。 |
| 独立认证和系统保护 | [t33/report01.md](../t33/report01.md) 记录 `b039409e` 候选上 OAuth 2 项、SSH Safe 三态 1 项、Git HTTPS 2 项以及 Safe 外部 3 项。真实协议使用回环，保护层多用 TestProtection。`P0.1-protection-platform-matrix.md` 记录基线 `4d86c84b` 的 Linux 真实 Secret Service 与绑定隔离、Windows 历史随包 UtilityProcess（`3bd2e24`），macOS 未实测。模块本机宿主与 Safe 的加密目录独立。当前源码搜索未见生产消费者调用 `secretUse`、`safe://` 或 `allowedModules`；`envRefs` 仅为旧规则识别、拒绝和脱敏，`safe.unlocked` 只驱动 Safe 状态查询。 |
| Safe 个人数据与 Git | `evidence-P10.1-safe-tools.md` 有 Windows CLI stdin、通用 HTTP、两种 MCP、逐项授权/撤权与锁定回放。P8.3 证据以 `f7901b0a` 为基线并含 `2c7994d3` 合入工作，Linux 临时 bare 仓有整代密文、Git 暂存与排除证据；用 `plugins/versioning/test/safe-sync.test.ts` 复用。ACC-SY-08 单账号 + 原密码的整包入口有早期证据。P8.2 的两份改密前后整包、三账号与标签以及导入缺件需要同候选复验。 |
| Mail 备份、实际 provider 与 Web | S6b.1 Windows 阶段已实跑 Mail 子集 ZIP 的恢复、冲突、附件字节、unknown 以及零重发，走 Mail 设置的预检/确认，范围独立于整 Vault ZIP。真实 Gmail/Outlook 客户端凭据与服务商授权未在合成夹具中证实，`apps/engine/src/main.ts:23–24` 的生产 OAuth 入口须部署配置客户端身份。S4.2 的 Exchange IMAP/SMTP 有回环，Graph 正文与 deltaLink 未实现，`oauth-provider.ts:109–119` 将 Graph 资源标为 `graph-metadata-only` 或 `wrong-resource`。Web 9 MiB 传输/取消已在返工版有所验证，物理第二设备和真实邮箱这些范围仍待授权环境。 |
| #4/#5 对第二组完整矩阵的影响 | Linux 可完成 SSH 或 Mail 的最短联验。全部五消费者中的 Agent 受保护交互启动在 `plugins/agent-cli/src/engine/interactive-environment.ts:116–121` 限 Windows x64；Automations 宿主在 `plugins/automations/src/engine/terminal-environment.ts:222–226` 限 Windows PowerShell 已迁移规则。现成 E2E 为 `tests/e2e/shell.spec.ts:1954` 与 `tests/e2e/workflows/acceptance.spec.ts:1394`，Linux 会跳过。方案评估和旧候选 Windows 结果不能替代共同制品的真实消费者矩阵。 |

本次只读仓库和已准许的合成记录。未运行测试、构建或打包，未读取真实邮箱、Safe、密钥或 Agent 历史。manifest 唯一当前任务为 `t4v/task03.md active`，Lead `t3p`，同号报告路径已核对。Core `hc get` 失败于锁目录只读，报告可在共享路径读取。

## Lead 验收

由 Lead 复核后填写。

## Lead 验收

已复核外部整库包的文件筛选与启动页/设置共用的导入函数。Lead 负责各入口的导出/导入接线和受管范围，按本报告安排合成 Vault 的 Mail/Safe 共同证据。此处仅验收审查交付。
