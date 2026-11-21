# task08 · 冻结候选 558af632 独立复审

对象 `558af6321062bc3a7e1738cf83eb8f219774520d`，基线 `897cd78a`。Mail 同地址返修通过。Pi 已知原生 ID 的替代件及旧活动绑定得到保守防重，遗留固定项恢复显示。Safe 独立 reveal 已接入生产目录和主要调用路径。P2 仍出现在普通 Pi 启动的防重、共享 MCP 的在途资源读取，以及 Safe 并发备份。 [交付报告](../t17c/report21.md)

## P2

### Pi · 活动记录缺原生 ID 或启动结果待核实时仍可能重复打开

普通工作台新建 Pi 走 `agent.workspace.launch`。会话记录仅从历史恢复、分支或内部 resume 参数取得 `nativeSessionId`，Core 确认后也没有从 Pi 新文件补录绑定。原 Pane 保持开启且 Pi 已写出 JSONL 时，历史列表会滤掉这条没有原生 ID 的活动会话，启动防重也无法匹配。最短验收用普通“新建 Pi”产生一份合成历史，保持原 Pane，再从历史选恢复，核对是否放行第二个启动。 [普通启动路径](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/ui/AgentCliModule.tsx#L244) [会话记录](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/sessions.ts#L480) [列表与防重](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/index.ts#L578) [D08](../../../../../temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-4-agent-cli/source.md#L581)

已有原生 ID 的恢复也有一道边界。首个提交如果 Core 返回 `spawn_pending`，本地持久记录可转为 `unknown`。相同 request ID 仍可对账；历史入口在旧调用退出后只阻止 `running/launching`，另一个 ID 可以提交第二次恢复。两条是冻结调用链的结论，阶段 E2E 没有覆盖。 [Core 待核实及绑定](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/sessions.ts#L757) [并发锁释放](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/index.ts#L589) [合成 ACK 夹具](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/test/launch-reconcile.test.ts#L197)

### 共享 MCP · bearer 或服务代撤销未覆盖目录与持久回执

直接 `/mcp` 在认证后会等待请求体和 SDK 初始化。工具调用的公共包装在前后均校验合成撤销信号，但 `list()` 和 `operation()` 仍直接用先前捕获的 caller/subject。持久回执查询只复核原主体和当前工具策略，不复核令牌或 MCP 服务代。短验收是在独立夹具中将已认证的资源查询停在处理前，撤销该测试 bearer 或关闭 MCP，再放行查询。预期拒绝；冻结调用链仍可返回原持久回执或目录。Safe reveal 不产出通用持久回执，并走有撤销校验的工具分支。 [MCP 信号与 backend](../../../../../temp/issue-worktrees/agent-lifecycle/packages/kernel/src/server/http-app.ts#L105) [资源查询](../../../../../temp/issue-worktrees/agent-lifecycle/packages/kernel/src/mcp.ts#L109) [回执权限](../../../../../temp/issue-worktrees/agent-lifecycle/packages/kernel/src/dispatcher.ts#L78)

### Safe · 并发业务写入可生成校验通过但缺有效密文的 ZIP

整 Vault 打包只绑定 Mail 的快照写锁。导出器先枚举路径，再逐文件读取并让出事件循环。Safe 在此期间可写新的版本密文并原子切换 manifest。若切换发生在枚举之后、读 manifest 之前，ZIP 可能包含旧版本密文和新 manifest；ZIP 外层 SHA 仍按实际所读文件成立。恢复后解锁可成功，读取该条目才发现新 manifest 所需的密文缺失。最短验收是独立 Vault 导出枚举后暂挂，提交一项合成账号编辑，再放行导出并导入，逐项解锁/reveal。现行定向通过用例为串行备份。此问题在基线已存在，仍违反本次备份恢复检查的同代约束。 [导出装配](../../../../../temp/issue-worktrees/agent-lifecycle/apps/engine/src/boot.ts#L171) [枚举与逐文件读取](../../../../../temp/issue-worktrees/agent-lifecycle/packages/vault/src/package/package.ts#L59) [密文发布和读回](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/safe/src/engine/store.ts#L209) [manifest 切换](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/safe/src/engine/store.ts#L317) [同代备份契约](../../../../../temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/design.md#L60)

## Mail 与 Pi 已核实的部分

- **Mail 同地址。** 新 OAuth 在账号锁、规范化地址锁内重读已发布定义，再提交凭据。子集恢复也在同一地址锁内检查。OAuth 已在等待、子集先恢复时，合成回归实际保留单个恢复账号，原 OAuth 返回 `failed/account-changed`。反向顺序由子集锁内检查拒绝。原会话的凭据代见证仍随 token 一起保存。冻结定向日志的 OAuth 两项通过。Lead 所记前置 15 项当作前置证据。 [提交与锁](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/mail/src/engine/accounts.ts#L161) [新增交错回归](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/mail/test/oauth-engine.test.ts#L865) [冻结日志](../../../../../temp/issue-baseline/558af632-safe-history.log#L15)
- **Pi 精确定位与替代件。** 定位需要 provider、native ID、物理 `historyId` 同时相等，并复核唯一原 Core/Pane。分支替换件、带已知 ID 的旧活动绑定若只有 provider/native ID/cwd 一致，会标为「可能已在运行」，拒绝直接定位、恢复和分支。旧活动绑定可从会话列表核对，原历史行不再能精确定位。原有恢复创建的物理绑定、原 Pane 与终端计数在冻结 E2E 已通过。旧 Core 会话跨候选更新以及普通新开会话未进入该测试。 [扫描物理身份](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/history/scanner.ts#L172) [定位](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/index.ts#L737) [替换回归](../../../../../temp/issue-worktrees/agent-lifecycle/tests/e2e/shell.spec.ts#L1359)
- **遗留固定与 provider。** 读取同时识别当前物理 ID、旧位置哈希和扫描内唯一的 `provider:id`，显式取消清理相应旧键，新固定只写物理 ID。旧位置 pin 可随同路径替换件显示，它不参与启动或定位授权。Claude/Codex 仍只有预览，D07 对历史恢复和分支的规格缺口未变。 [旧键及新键](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/history/scanner.ts#L276) [固定读取](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/index.ts#L646) [清理](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/pins.ts#L23) [资格](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/agent-cli/src/engine/index.ts#L577) [遗留固定回归](../../../../../temp/issue-worktrees/agent-lifecycle/tests/e2e/workflows/acceptance.spec.ts#L383)

## Safe P10.1 与组合证据

| 项目 | 冻结边界与证据 |
| --- | --- |
| 静态目录、默认与逐项开放 | boot 先登记描述再绑定 handler，停用保留完整元数据，实际调用仍由插件状态和工具策略判断。reveal 为 read/high、默认关闭，服务端拒绝混入多项开启，UI 的全开、按插件、按选中、按范围和只读批次跳过该项，单行明确开放和批量关闭可用。专门的 Safe 停用目录重启断言尚未找到；同一静态目录机制已用于其他插件。 |
| 锁定、换 Vault 与同键 | 外部 `safe.status` 生成绑定 caller/subject、实例及解锁代的证明。锁定代递增、清除内存密钥；跨 Vault/重启无法复用证明。普通读只返回 `hasPassword`，明确指定 entry 与 account 才返回明文。reveal 走实时读，无通用持久回执；相同键读取当前值。个人写由 handler 自己按版本检查，不写共享输入摘要或回执；同键重交已过版本的写入冲突。 |
| Bearer、MCP 与 Web 撤销 | 令牌表按 token 取消 signal，MCP 配置变更取消上一代。通用 POST 在回包前丢弃已撤销请求并回 401，直接 MCP 工具返回权限错误，stdio 经共享 POST 也会丢弃结果。MCP 关闭后，普通 HTTP API 独立仍可使用。共用 POST 与直接 MCP 均设置 `Cache-Control: no-store`。Safe 本身在暂存发布和解密返回前复查，审计只记动作、标识和结果。直接 API bearer、MCP HTTP 关停和 Web 邀请的阻塞夹具存在；精确执行证据见下文。当前无 stdio 在途关停精确证明；通用 401 经 CLI 适配会转为 `INTERNAL`，与直接 MCP 的权限错误不一致。 |
| 旧入口与原件 | 生产 `apps/packages/plugins` 源码检索未见 `safe.items.*`、`safe://` 解析、`secretUse` 或 `allowedModules` 授权入口，余项为否定测试、历史资料及要求补配的旧格式诊断。外部旧名称返回未知能力。真实旧格式合成夹具保全 metadata 和密文；另有旧 keyring 不变单测。SSH/Git 使用各自凭据，组合日志记录 Safe 状态变化无额外请求。 |
| 串行备份及策略边界 | ACC-SY-08 在冻结门禁通过，校验 Safe 文件字节，恢复到不同 Vault 后用原主密码揭示指定账号。当前通用 ZIP 收集也包含工具策略和 HTTP bearer 哈希。恢复后原 Safe 证明失效，但旧归档可带回导出时的策略及有效 bearer 哈希。#6 另有策略恢复合同；未找到针对归档中旧 token 与 reveal 策略联动的定向实证。 |

[Safe 静态装配](../../../../../temp/issue-worktrees/agent-lifecycle/apps/engine/src/boot.ts#L130) [披露定义与会话](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/safe/src/engine/index.ts#L66) [实时策略检查](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/safe/src/engine/index.ts#L119) [解锁代](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/safe/src/engine/safe.ts#L298) [普通摘要及明文](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/safe/src/engine/safe.ts#L525) [服务器批次](../../../../../temp/issue-worktrees/agent-lifecycle/packages/kernel/src/capabilities/system.ts#L95) [UI 批次](../../../../../temp/issue-worktrees/agent-lifecycle/packages/workbench/src/gateway/ToolPolicyCatalog.tsx#L87) [令牌撤销](../../../../../temp/issue-worktrees/agent-lifecycle/packages/kernel/src/server/tokens.ts#L30) [共享 HTTP](../../../../../temp/issue-worktrees/agent-lifecycle/packages/kernel/src/server/capability-http.ts#L39) [MCP 服务代](../../../../../temp/issue-worktrees/agent-lifecycle/packages/kernel/src/gateway-tokens.ts#L51) [旧入口实证](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/safe/test/external.engine.test.ts#L175) [旧 keyring 单测](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/safe/test/safe.test.ts#L349) [串行备份](../../../../../temp/issue-worktrees/agent-lifecycle/apps/engine/test/engine.test.ts#L1239) [P10.1 契约](../../../../../temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P10.1-external-safe.md)

## 版本与门禁分界

- `t17c/report21.md` 的旧组合在生成资源绕过缺失的 Home 贡献后验证界面。冻结建包输出为 `558af63`，标准桌面产物已成功进入 Safe，多账号显隐锁定、窄窗冲突用例通过。这证明该组合可启动并操作 Safe。它不证明安装器。 [历史交付](../t17c/report21.md) [冻结生产构建](../../../../../temp/issue-baseline/558af632-safe-history.log#L364)
- 精确门禁的 Engine 阶段为 6 通过、51 跳过。Safe 外部文件只运行覆盖多入口、逐项开放、同键和换 Vault 的第一条。在途 bearer/MCP 及 Web 撤销两条被本门禁名字筛选跳过。另一个同工作树组合日志为 88 通过、6 跳过，列出三条 Safe 外部测试均通过，包含阻塞与撤销夹具所在用例。组合运行开始早于冻结提交且日志无 SHA，仅作邻近证据。 [冻结定向阶段](../../../../../temp/issue-baseline/558af632-safe-history.log#L10) [组合阶段](../../../../../temp/issue-baseline/safe-combined-focused.log#L10) [阻塞夹具](../../../../../temp/issue-worktrees/agent-lifecycle/plugins/safe/test/external.engine.test.ts#L382)
- 冻结桌面阶段 **8 通过、2 失败**，门禁未全绿。原生 Pi 分支/恢复/原 Pane、同路径替代件拒绝、新旧 pin 持久化、网关单项开关及排除批量 reveal、Safe 桌面与标签均通过。Web 邀请已成功进入 Safe、初始化并显示解锁页，随后 trace `pspq@269` 等待「锁定保险箱」超时，生产页按钮名为「手动锁定」。本轮未验证 Web UI 重锁和重新解锁。被正则同选的 SSH 用例在查找上传文件行时失败。 [E2E 结果](../../../../../temp/issue-baseline/558af632-safe-history.log#L378) [Web 与 SSH 失败详情](../../../../../temp/issue-baseline/558af632-safe-history.log#L394)

本次仅审阅冻结 Git 对象、交付规格与既有日志和 trace，唯一写入为本报告。
