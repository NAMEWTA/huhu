# #8 Mail 目录发现返工独立复核

- terminal_address — t4z
- task — task09.md
- Core — Windows 本机 wta，`346bd5608735e3fcb27f9d01f5c8008e`，0.1.21。清单指向 `t4z → task09.md → active`。
- 执行结果 — done（建议签收 S1a.1 私有领域返工）
- 冻结候选 — `6d9fde656fdc108b5d355a378ab295f3d9418b26`，直接父 `be12ca89984b760face1778499db222f98caab40`，候选树 `5aabd5d2cbca277fe49a2a65d351af87cd6386a3`。差异共 4 个文件，均在 `plugins/mail`。

## 签收建议

**规格轴通过。** 有 NAMESPACE 前缀的有效 INBOX 能发现并保存，真正缺失或不可选的 INBOX 仍阻止保存。同步取消监听器中的重入在网络调用前被拦截，晚到响应失效。独立三路回环测试核对了每次实际 LOGIN 使用的账号与合成密码。中间失败没有写入，最后一次成功发现以同一账号、端口、目录和密码快照发布一次。

**规范轴通过私有领域范围。** 复用锁定的 ImapFlow、Vault 和 ModuleCredentials，当前分支的发布冻结安装仍因根锁缺 Mail importer 而失败。建议签收该私有增量，由 Lead 补根锁、Engine 与真实宿主保护接线，另验 Safe 锁下的实际组装和安装包。 [S1a.1 验收](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S1a.1-account-discovery.md) · [t54 原复核](../t54/report05.md) · [t11x 返工报告](../t11x/report01.md)

## 规格轴

| 核对项 | 父提交与候选实测 |
| --- | --- |
| 有前缀的真实回环 | 父提交只发 `LIST "INBOX." "*"`，对有效邮箱报 `inbox-required`。候选额外发送 `LIST "" "INBOX"`，可选的 `inbox` 规范化为 `INBOX` 并自动选中，`INBOX.Projects` 的原路径和 `.` 分隔符保存后正确。无前缀路径继续使用单次 LIST。 [父版红灯](evidence-task09/parent-probes.log) · [候选实测](evidence-task09/candidate-probes.log) · [无前缀回归](evidence-task09/frozen.log) |
| 缺失与不可选 | 精确 LIST 分别返回空、`\Noselect`、`\NonExistent`，候选均报 `inbox-required`。随后保存返回 `discovery-required`，账号与保护键均为零。另注入一个只出现在 LSUB 的 INBOX，缺失判定保持，Vault 写入 0 次。 [候选实测](evidence-task09/candidate-probes.log) |
| 原同步重入问题 | 父版在 `update(B)` 的同步 abort 监听器中重测成功，两次适配器调用同为 A 的账号和端口；紧接着的保存原本应该拒绝，实际成功。修复版同回调返回 `discovery-stale`，此时仅调用过一次 A。关闭或更新回调取代重测、旧响应晚到也均通过冻结用例。 [父版红灯](evidence-task09/parent-probes.log) · [候选实测](evidence-task09/candidate-probes.log) |
| 独立 A/B/C 实际网络与写入 | A 停在 LIST，换 B 即断开 A，回调重入不建第二条连接。B 认证拒绝后换 C，省略密码返回 `credential-required` 且 C 未收到命令。显式重填后 C 发现并保存。三台回环服务各观察到 1 次 LOGIN，账号和规范化合成密码均与本次请求相符，LIST 次数为 1、0、2。首次成功发布前 Vault 写入和保护键均为零，最终写入 1 次、保护键 1 把。重开同一 Vault 后账号与目录不变，受信取用验证 C 的邮箱、端口和成功 LOGIN 所用密码一致。日志只记录合成身份及匹配结果。 [独立回环探针](evidence-task09/candidate-probes.log) |
| 原保护事务回归 | 已获发现结果后，保护锁定、Vault 发布失败保留可编辑草稿；失败无账号、可用钥匙或遗留版本，重试只发布一次。全量回归也覆盖 18 项命名预设和自定义、SMTP 覆盖、真实认证/LIST/断线故障、STARTTLS 缺失、自签证书和 OAuth 分流。 [冻结回归](evidence-task09/frozen.log) |

## 规范轴与发布依赖

- `update` 先安装克隆后的设置和凭据快照，再清除目录、选择及取消旧发现。`testConnection` 在同步取消窗口拒绝重入，调用网络前、响应后和安装结果前核对发现代次及输入对象。适配器收到 IMAP 端点副本。目录选择和保存验证同一当前发现，保存直接取该发现的解析后设置与有效密码，沿用 `ModuleCredentials.save` 的单次条件发布。保存失败可重试，成功关闭草稿并清除草稿内密码引用。见 `6d9fde6:plugins/mail/src/engine/accounts.ts:82–120,126–161,171–210`。
- `imap-discovery.ts:33–49` 只在前缀非空时使用完整 ImapFlow 路径。该路径还可能读取订阅标记并排序。回环 rev1 实测确有一次 LSUB，辅助查询的 tagged NO 保留成功 LIST 结果，订阅独有的条目不会成为可选目录。固定库允许辅助查询的传输失败或节流返回错误。账号仍以真实发现的可选 INBOX 为门槛；本轮没有把回环 rev1 覆盖扩大为所有服务商的扩展兼容性。 [锁定库列表实现](D:/Document/code/huhu/temp/issue-baseline/mail-protocol/node_modules/imapflow/dist/esm/commands/list.js) · [辅助 LSUB 实测](evidence-task09/candidate-probes.log)
- Mail manifest 固定 `imapflow: 2.12.1`，同时依赖工作区 Kernel 与 Zod。独立走查 S0.2 npm 锁和既有安装，从 ImapFlow 递归核对 25 个必备依赖实例，已安装版本全部与锁一致，均有完整性字段。两个冻结提交的根锁 blob 同为 `8165f3147cf5564a2d36a67959f3afed0d697f95`。完整 manifest 归档以 pnpm 12.10.1 执行离线冻结检查，25 个工作区项目，退出 1，`ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER` 指向 `plugins/mail`。Lead 接线时需要登记 importer 和依赖闭包并重新验证冻结安装。领域验证使用固定本机 ImapFlow 安装，对应源码均来自 Git 归档。 [依赖闭包](evidence-task09/dependency-closure.json) · [冻结安装](evidence-task09/frozen-lock.log)
- 冻结树的 `apps/engine/package.json` 与 `apps/engine/src/boot.ts` 没有 Mail 声明或注册。正式验证需要注入当前 Vault、可信本机实例与保护驱动。此次写者重开使用合成保护，生产 Engine、真实 Safe 状态、安装包和真实邮箱仍属 Lead 接线验收范围。

## 验证与证据

- Windows build 26300，Node 24.21.0，Vitest 3.2.7，ImapFlow 2.12.1。父版两个原问题各复现一次。候选冻结范围 Mail 22 项与 Kernel 凭据 17 项全通过；候选独立重放 9 项通过、15 项因名称过滤跳过。Cosmokit/Cordis 和 Mail 类型检查、两提交 `git diff --check` 均通过。 [冻结回归](evidence-task09/frozen.log) · [父版红灯](evidence-task09/parent-probes.log) · [候选探针](evidence-task09/candidate-probes.log) · [类型检查](evidence-task09/typecheck.log)
- 临时 Git 归档及合成服务已清理，保留证据。业务工作树、分支、远端、共享锁均只读。 [归档脚本](evidence-task09/archive.ps1) · [重放夹具脚本](evidence-task09/probes.ps1) · [依赖核对脚本](evidence-task09/verify-closure.cjs) · [差异与清理日志](evidence-task09/validation-cleanup.log)
