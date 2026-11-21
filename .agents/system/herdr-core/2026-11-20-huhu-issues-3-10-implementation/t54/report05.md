# #8 S1a.1 邮箱定义与凭据发布独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t54
- task — task05.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/task05.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/report05.md
- 执行身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t54
- 执行结果 — done

## 结论

- **规格轴**：18 个预设与自定义、普通目录发现、目录选择、真实回环认证拒绝、同草稿并发保护、私有凭据原子发布和备份副本失绑定均有通过证据。仍有两个发现缺口。有 NAMESPACE 前缀的服务器可被误判为缺 INBOX；同步取消回调重入可使新设置保存旧连接的目录。
- **规范轴**：复用 ImapFlow、Vault 与 ModuleCredentials。候选遗漏根锁的 Mail importer 和依赖闭包，冻结安装独立复现失败。生产 Engine 未装配 Mail，运行时能力表为零。组合安装和桌面入口应按后续接线验收。

**合入建议**：暂缓将本提交作为已完成的 S1a.1 合入。先修复两个发现缺口并复跑回环/并发探针，由 Lead 合并根锁与依赖闭包。可保留当前私有领域增量供返工，生产启用另需 Engine、宿主保护和桌面接线。 [S1a.1](../../../../dev/changes/2026-11-19-issue-8-mail-module/tasks/S1a.1-account-discovery.md) · [t9k 实现与验证](../t9k/report01.md)

## 冻结范围

候选 `be12ca89984b760face1778499db222f98caab40`，直接父提交 `5beba4c1c8028988a9c7440584fbcd4c71b2b4fb`，候选树 `9381aa9297b2c316c53e8b4e68a4ad17f3ba9bdb`。13 个差异文件均位于 `plugins/mail`，含目录发现、账号入口、定义与预设、manifest 及测试。通过 `git archive` 在一次性 Windows 临时目录复核，工作区包指向归档源码，第三方依赖复用已有安装，ImapFlow 2.12.1 复用 S0.2 固定的本机 npm 依赖。Node 24.21.0，Vitest 3.2.7。所有账号、Vault 和凭据均为合成数据，IMAP 只监听回环。

## 规格轴

### P2 · 有 NAMESPACE 前缀的可用 IMAP 账号被误判缺少 INBOX

回环服务器通过真实 `NAMESPACE` 返回前缀 `INBOX.` 和分隔符 `.`，对命名空间的通配 LIST 返回 `INBOX.Projects`，对 INBOX 精确 LIST 返回可选的 `INBOX`。候选成功登录，发出的唯一 LIST 是 `LIST "INBOX." "*"`，随后返回 `inbox-required`。用同版本 ImapFlow 的公开 `list()` 调同一回环服务器，观察到额外的 `LIST "" "INBOX"`，结果合并为 `["INBOX", "INBOX.Projects"]`。

锁定 ImapFlow 2.12.1 的 `listOnly` 在 INBOX 补查分支前返回。应复用支持补查的库路径，并继续按服务器事实检查 INBOX 是否可选。当前的必选校验本身拒绝真正缺少或不可选的 INBOX。该错误阻止有有效 INBOX 的命名空间账号完成新建。定位 `plugins/mail/src/engine/imap-discovery.ts:33–38`、`accounts.ts:92–105`。 [回环与 Engine 日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/extra-tests.log)

### P2 · 同步取消重入可让目录结果跨越旧、新草稿设置

用受信 discovery 夹具故障注入。A 的第一次发现仍等待，在其 AbortSignal 监听器内同步触发一次重测。调用 `update(B, 合成新凭据)` 时，取消回调在 B 提交到草稿前发起了第二次 A 发现。两次发现实际都使用 `fixture@example.invalid:1143`，没有测试 B 的 IMAP。B `other@example.invalid:3143` 最后却成功保存 `["INBOX", "Previous/Only"]`，其中第二个目录只由 A 发现返回。

`update` 在更新设置前调用 `#invalidateDiscovery`，其中 `abort()` 同步运行回调。新建的尝试保持为当前 attempt，结果校验只比较 attempt 引用。建议在触发取消回调前完成设置与发现代次切换，并在安装结果及保存时检查批准的发现上下文。当前默认 ImapFlow 适配器的取消路径独立通过，重入由可注入的受信适配器探针触发。定位 `plugins/mail/src/engine/accounts.ts:77–112,128–145,170–185`。 [独立并发与绑定日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/probe-tests.log)

### 已通过的行为和边界

| 范围 | 实测 |
| --- | --- |
| 预设及手动覆盖 | 冻结测试逐个核过 18 个命名预设与 custom，含完美邮箱 111.com/email.cn 及 Gmail 两种认证选项。命名预设手改端口、关闭 SMTP、自定义启用 SMTP 在保存后读回保持原值。Outlook 的预设基线按 Issue 固定为 `smtp.office365.com:587`，个人服务差异由帮助入口与覆盖能力承担。 |
| 真实发现与普通读取 | 两个独立回环连接均实际见 `LOGIN → CAPABILITY → NAMESPACE → LIST`。可选 INBOX 自动选中；不可 SELECT 容器可显示，不能写入已选配置。保存后写者重开读回相同 accountId、revision、端口、认证状态及所选目录。普通列表和可移植 JSON 未出现夹具密码；受信 use 回调验证同一密码及定义。 |
| 常规并发和取消 | 重测在途时调用 save 返回 `discovery-required`。独立探针把 Vault 写入停在发布门槛，保存中的 testConnection、第二次 save、update 和 close 均为 `draft-busy`；释放后仅一个账号和一次凭据发布。真实回环 A 停在 LIST 时改邮箱和端口，A 断开；省略密码时 B 没有收到命令，显式重填后 B 重新认证和发现。 |
| 认证与故障恢复 | 冻结测试覆盖认证拒绝、LIST 拒绝、断线、要求 STARTTLS 时缺升级能力、自签证书拒绝。失败后草稿可编辑、无账号或保护键。独立探针在 Vault 发布前注入失败，得到 `storage-failed`，账号、暂存版本和保护键均为零；同草稿重试一次成功，重开及 recover 后保有同一 ID/revision。OAuth 草稿返回 `oauth-required` 并跳过密码发现。 |
| 受信绑定 | 同一绑定的 use 成功；逐项更改邮箱、认证方法、IMAP host/port/security、SMTP 开关及启用时的 SMTP host/port/security，九次均拒绝为 `corrupt` 且无回调。新草稿仅改 SMTP 目的地后，旧发现失效，重新测试 IMAP 后仍可用草稿已有密码发布新 SMTP 定义。该观察只证明配置及绑定；S2 的实际 SMTP 使用需核对冻结的发送目标、凭据授权和反馈。 |
| 备份副本 | 通过真实 Vault `exportPackage`/ `importPackage` 把合成副本导入同机新 Vault。通用 ZIP 收集了 `.huhu/module-credentials` 定义；宿主注入的 Vault 外保护根与密钥未随包携带。新实例保留原 accountId/revision，认证状态为 `needs-reconfiguration`。仍需 S6 的 Mail 子集、同包仲裁、实际宿主保护适配和安装版验证。 |

[行为规格](../../../../dev/changes/2026-11-19-issue-8-mail-module/spec.md) · [仓库回归日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/suite-tests.log) · [独立并发与绑定日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/probe-tests.log)

## 规范轴

- 冻结 lockfile 的 blob 为 `8165f3147cf5564a2d36a67959f3afed0d697f95`，父提交与候选相同。独立 manifests 归档以 pnpm 12.10.1 运行 `install --offline --frozen-lockfile --lockfile-only --ignore-scripts`，退出 1，`ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER` 直指 `plugins/mail` 缺 importer。S0.2 npm lock 与实际安装中，从 ImapFlow 2.12.1 递归核对 25 个必须依赖实例，均有同版本和完整性元数据。根 pnpm 锁需由 Lead 引入该闭包及来源记录。 [冻结安装日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/lockcheck.log) · [25 个依赖实例](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/dependency-closure.json)
- 在冻结 Engine 上启动合成 Vault 并调用真实桌面 HTTP，`plugins.list` 无 Mail，registry 中无 `mail.*`，直接请求 `mail.accounts.list` 返回 `CAPABILITY_NOT_FOUND`。`plugins/mail` 提供进程内 openMailAccounts 及空能力贡献 manifest。Engine 接线需要声明 workspace 依赖和注册插件，注入经核验的当前 Vault、Vault 外应用私有根、宿主本机实例 ID 和真实 OS 保护适配，使写者重开时调用 recover。 [Engine 实跑日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/extra-tests.log)
- Mail S1a.1 只提供新增和回读。凭据层发放 revision，新增以 `expectedRevision:null` 条件提交。本轮确认重开及包副本保留 revision。现有账号配置转代、替换与删除分别由 S1a.3/S1a.4 处理；接线时应传实际 expectedRevision 并沿用 #9 的显式 keep/replace/clear。OAuth、实际 SMTP、生产桌面授权和组合安装候选有单独依赖，不属于该冻结私有路径。 [设计与发布顺序](../../../../dev/changes/2026-11-19-issue-8-mail-module/design.md) · [原型确认](../../../../dev/changes/2026-11-19-issue-8-mail-module/prototype-review.md)
- Mail 端复用成熟库处理 IMAP，复用 ModuleCredentials 处理版本、绑定和保护。本轮没有复制参考 OneMail 源码。git 差异检查、Cosmokit/Cordis 声明构建以及 Mail 类型检查均通过。使用本地归档的 S0.2 锁与已安装包作版本和闭包核对，未替换生产根锁。

## 实跑命令与日志

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --project @huhu/plugin-mail --project @huhu/kernel test/accounts.test.ts test/credentials.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --project @huhu/plugin-mail plugins/mail/test/t54-r5-review.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --project @huhu/plugin-mail plugins/mail/test/t54-r5-engine-namespace.test.ts
foreach ($p in 'vendor/cosmokit','vendor/cordis','plugins/mail') { node node_modules/typescript/bin/tsc -p "$p/tsconfig.json" }
pnpm install --offline --frozen-lockfile --lockfile-only --ignore-scripts
git diff --check 5beba4c1c8028988a9c7440584fbcd4c71b2b4fb be12ca89984b760face1778499db222f98caab40
```

- 冻结回归两个测试文件，Mail 15 项与 kernel 凭据 17 项全通过。[仓库回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/suite-tests.log)
- 两组独立探针合计 6 通过、2 失败。失败仅为 NAMESPACE 下漏查 INBOX 与同步取消重入。备份、绑定、原子失败重试、常规并发和 Engine 入口均实跑通过。[并发与绑定](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/probe-tests.log) · [回环 NAMESPACE 与 Engine](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/extra-tests.log)
- 依赖证据为 25 项核对通过和冻结安装缺 importer。[依赖闭包](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/dependency-closure.json) · [冻结安装](C:/Users/cdewta/AppData/Local/Temp/huhu-t54-r5-677ce372/evidence/lockcheck.log)
- 本轮三个命令 pane `t111`、`t114`、`t116` 已关闭。根仓库和用户改动均只读，未新增 Git worktree。

## Lead 验收

由 Lead 追加。
