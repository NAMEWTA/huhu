# `42d332a9` 独立复验

**阻断 OAuth 完成结果签收。** 真实 Engine 的本机夹具中，授权已完成并保存原账号，同一 Vault 重启后却无法按旧会话 ID 查询，同键重交把这笔成功报告为 `expired`。仍在交换的会话也得到完全相同的答复。一次性门有效，两种情况均未重复打开浏览器或重发授权。`31d1379a` 的 G3.3 上轮 P1/P2 触发条件通过定向复验。

冻结对象为 `42d332a9083c83c3f3054afc449fd0c01f0b1421`。核对 Mail `5deb8d39`、`5ee5fa1c`、`704f8271`、`44358105`、`42d332a9` 和 Gateway `31d1379a`。开始时 integration HEAD 等于目标且干净。复验使用上述 Git 对象及真实 Engine 的本机临时 Vault、签名 issuer、IMAP 夹具和实际 HTTP 入口。生产构建及 E2E 以 Lead 日志为证据。 [任务](task03.md) · [Mail 上轮审查](report01.md) · [Gateway 上轮审查](report02.md)

## 阻断项

### P2 · OAuth 重启回读混淆已保存、在途和过期

`mail-oauth-intents.ndjson` 只登记写前受理。通过账号主体校验、凭据提交后的 `configured`、拒绝、取消等终态只存在会话 Map 里。查询只访问该 Map。同键重交先查账本，命中后找不到内存状态便返回 `expired`，没有核对持久终态或与原操作绑定的凭据提交事实。正常重启、插件停用后重开、达到会话容量后的内存回收都能丢失原结果。候选的证据文档和回归有意把无内存会话统一映射成 `expired`。 [受理、查询与重交](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:109>) · [凭据保存后的内存终态](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:208>) · [取消及停用清理](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:289>) · [既有验收写法](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/test/oauth-engine.test.ts:731>)

| 真实入口最小顺序 | 独立观察 |
| --- | --- |
| 用稳定键 `begin` → 有效回调 → 本机 issuer 验签和 IMAP 鉴权 → `status` 确认 `configured` → 重启同一 Vault → 原会话 ID 和原键分别回读 | `status` 为 `NOT_FOUND`，`begin` 为原 ID 的 `expired`。账号 ID 与重启前相同。账本只有 `accepted`，浏览器打开 1 次、token 交换 1 次。 |
| 用稳定键 `begin` → 有效回调进入 `finishing` → issuer 挂起交换 → Engine 正常关闭 → 重启同一 Vault → 原会话 ID 和原键分别回读 | 同样得到 `NOT_FOUND` 与原 ID 的 `expired`。账号数为 0，浏览器打开 1 次。 |

**通过条件**　有持久完成证据时，同主体用原 session ID 及原键读回 `configured` 和原账号。未证实提交时保留原 ID 与待核实结论，明确区分证实的取消、拒绝、过期。复验须覆盖凭据提交前后中断、正常关闭、停启、容量回收、跨 Vault 和异主体，并观察原码交换与凭据提交次数。在账号提交和终态记账之间有缺口时，仅凭同邮箱存在不足以证明它属于原操作。

## 其余返修

| 原问题 | 复验判断和证据 |
| --- | --- |
| Mail P2 · 浏览器回执覆盖 `finishing` | 已关闭上轮触发条件。有效回调同步占有一次性门，进入 `finishing`。浏览器迟到拒绝只会结束仍为 `waiting` 的会话。定向 runner 的本机夹具阻塞交换后拒绝 ACK，保持 `finishing`，拒绝同地址并发新键，放行后配置一次。有效回调处理和重交各只使用原会话。 [新门限](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:195>) · [迟到 ACK](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:275>) · [夹具](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/test/oauth-engine.test.ts:614>) |
| Mail P2 · 重启重交旧等待状态 | 写前受理、同进程实时重交和重启防重复成立。两种恢复场景实测均只开一次浏览器。终态和待核实的可查询性仍阻断，见上文。 [写前受理](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:139>) |
| Mail P2 · 服务令牌共用会话所有者 | 已关闭。Mail 按物理 Vault 摘要、已认证的 caller 和 subject 定位会话。定向 runner 的真 HTTP 入口签发两个合成令牌，异主读取及取消得到 `NOT_FOUND`，自报 subject 无效。各用同键可各自认领不同会话，当前 Vault 桌面可以管理。账本未写入测试 email、state、nonce、code 或明文令牌。 [actor 判定](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:102>) · [真 HTTP 夹具](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/test/oauth-engine.test.ts:678>) |
| Mail P2 · 停用能力没有静态登记 | 已关闭。manifest 包含四项，实际 `apps/engine/src/boot.ts` 在激活前声明同一描述符。仓内 Mail 测试包装器会补登记，单看该测试不能证明生产装配。独立直接导入真实 boot，无补登记，有效状态读到四份描述，停用后启动仍返回四份描述且为 `plugin-disabled`。Runner 另验过停用预配置、重新启用和实际发现。 [生产预登记](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:129>) · [测试包装器](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/test/fixtures/engine.ts:8>) · [目录用例](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/test/oauth-catalog.test.ts>) |
| Mail P3 · Google 客户端秘密沿子进程传播 | 原查到的 Main 至其他子进程和独立 Engine 环境继承路径已关闭。Main 在装配时提取并删除环境值，仅在 fork Engine 时注入，Engine 入口再提取并删除，独立启动也执行清理。已有 Windows Electron 夹具看见 Main 环境和浏览器 URL 均没有合成秘密。实际 Google token endpoint 未参加复验。 [Main 环境](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/engine-supervisor.ts:6>) · [Engine 清理](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/main.ts:7>) · [独立秘密边界日志](<D:/Document/code/huhu/temp/issue-baseline/oauth-credential-scope.log>) |
| G3.3 P1 · Vault 复制后绑定到源进程 | 已关闭原物理复制路径。Engine 原子写入绑定，CLI/stdio 在使用本机端口和令牌前检查 `dev:ino` 和 `birthtimeNs`，缺文件身份时比较真实路径。定向 fixture 在源 Engine 仍活跃时复制描述文件与逻辑 Vault ID，副本 CLI/stdio 拒绝旧端点。启动副本后绑定其独立端口，查询源回执 `NOT_FOUND`，源任务仍只有一条。该证据覆盖绑定文件与物理目录，未检验同一根目录里陈旧 PID 被重新分配的场景。 [根绑定](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/vault/src/identity.ts:18>) · [CLI 校验](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/cli/src/connect.ts:21>) · [端点发布](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:516>) · [已运行的回归](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/cli/test/cli.test.ts:54>) |
| G3.3 P2 · 无 LF、半行与伪造受理 ID | 已关闭。每次 append 先写分隔 LF，完整无 LF 的末行可恢复后继续受理。真正半行令账本禁止新 claim，保留已读记录，新请求返回 `not-accepted` 且无虚构 ID。持久意图的写前 flush、有效记录重交及 `accepted` 重启后为 `unknown` 的断言通过。 [账本](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/operation-receipts.ts:45>) · [回归](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/test/dispatcher.test.ts:131>) |
| G3.3 P2 · 声明外字段写入完成回执 | 已关闭。完成分支保存 `projected.data`，坏类型转 `invalid-output`，重复尝试调用次数仍为 1。回归明确断言声明外合成字段未落盘；独立真实 Engine HTTP、HTTP MCP 和 MCP `resources/read` 读到同一个 Task、已验证的输出及操作 ID。 [结果投影](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:103>) · [回归](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/test/dispatcher.test.ts:131>) |
| G3.3 P2 · 旧幂等信封按角色共享 | 已关闭新请求的共享结果。兼容键由 `caller + subject` 命名空间隔离，遇到旧角色缓存则返回无可信 owner 的 `unknown`。独立真 HTTP 探针签发两个服务令牌，两者分别以同一个旧键创建，读回各自原 Task；同持久键也各有操作。用同 token 从 HTTP API 重交至 MCP HTTP 得同一原回执。另一 token 按 ID 查询得到 `NOT_FOUND`。 [兼容路径](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:148>) · [持久 owner](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:78>) |

## 剩余验证边界

- **P3 待证实 · 浏览器已打开但有效回调尚未到。** Engine 将 Main 的明确拒绝、消息发送失败和 5 秒 ACK 超时送进相同拒绝分支。若 Main 自身较迟回执，在仍为 `waiting` 时会终止原监听。未在真正系统浏览器复现 ACK 丢失。应分别验证明确拒绝和仅通信超时，记录能否在原会话的有效期内接受最后一次回调。已证实的 `finishing` 竞态修复不受该观察影响。 [私有主机超时](<D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/main.ts:37>) · [监听关闭条件](<D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/oauth-sessions.ts:275>)
- `31d1379a` 顺带修正 G3.3 发现。账本缺失或损坏时，`supportsDurableIntent` 为假，HTTP 发现和 MCP 意图模板不再公布可受理状态。已可证明的旧回执仍由实际调用授权决定。 [发现可用性](<D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/capability-http.ts:21>)

## 定向证据

- `g33-review-fix-gates.log` 记载 4 个项目类型检查完成，3 个测试文件 87 通过、4 跳过。CLI 18 项包含物理复制，Kernel 23 项包含半行、输出和旧令牌主体回归，Engine 包含真实 HTTP 和 MCP 鉴权。 [Gateway runner](<D:/Document/code/huhu/temp/issue-baseline/g33-review-fix-gates.log:19>)
- 本轮独立运行两个短探针，通过现有 `tsx` 直接载入 Engine boot，使用临时 Vault。第一组用实际签名验证和 IMAP XOAUTH2，确认成功凭据与失联会话的差异。第二组实际停启 Mail、签发两枚独立测试令牌、经 HTTP 与 MCP 提交及读取，再重启一笔交换挂起的授权。两个探针均解析真实 API 回包。`git diff --check 31d1379a^ 42d332a9` 通过。
- `42d332a9-assembly.log` 的 Windows Vitest 段为 22 文件、166 通过、4 跳过。构建信息为 `42d332a`。组合 Playwright 结果见下一段。 [装配 runner](<D:/Document/code/huhu/temp/issue-baseline/42d332a9-assembly.log:120>) · [冻结构建号](<D:/Document/code/huhu/temp/issue-baseline/42d332a9-assembly.log:464>)
- 该冻结装配的 Playwright 段为 20 通过、3 失败。SSH host-records 与 import 各有一个 `locator.click` 超时，SSH H4.2 夹具移除主机文件时得到 `ENOENT`。这 23 项全部是 SSH 相关测试，本段没有 Mail Playwright 运行结果。组合门禁有失败，排查归相应 SSH 切片。 [两个点击超时](<D:/Document/code/huhu/temp/issue-baseline/42d332a9-assembly.log:535>) · [H4.2 文件错误及汇总](<D:/Document/code/huhu/temp/issue-baseline/42d332a9-assembly.log:702>)
- provider 和邮箱均为本机合成夹具。真正 Google/Microsoft 登录及部署不在本轮证据范围。独立复验的唯一交付写入为本报告。
