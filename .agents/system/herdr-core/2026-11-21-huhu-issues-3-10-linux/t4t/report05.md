# #7 主机 CA 策略与真实 KEX 独立审查

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`，Core `wta-ubuntu`，Lead `t3p`，worker `t4t`。
- `t4t/task05.md` → `t4t/report05.md`。任务完成。审查固定候选 `84d19cb8cb180c2daa28ad2d5964f2729e196d49` 对父提交 `0714ca6c`。建议优先修复两项 P1 信任策略问题。

## 规格问题

### P1 · 以证书表示的撤销规则未覆盖同一叶公钥

OpenSSH 的 `@revoked` 对适用主机的记录比较公钥身份，支持证书和裸公钥之间的比较，并检查证书的签发 CA。候选把匹配规则解码成原始 blob；证书校验分别对完整证书、裸叶公钥和 CA 公钥做字节比较。若撤销记录以 Ed25519 证书表示，它只会拒绝相同证书 blob。同一叶公钥续签的新证书可通过其他策略检查；裸公钥检查也不识别证书形式的撤销记录。这会使用户已标记撤销的公钥仍被接受。现有测试分别撤销原样证书、裸叶公钥和裸 CA，未断言两种编码代表同一公钥时的结果。 [撤销集合与裸钥判定](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/known-hosts.ts:64) · [证书撤销比较](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/host-certificate.ts:96) · [已有撤销用例](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/test/host-certificate.test.ts:199) · [OpenSSH 10.2p1 的撤销检查](https://github.com/openssh/openssh-portable/blob/V_10_2_P1/hostfile.c#L297-L312) · [公钥相等定义](https://github.com/openssh/openssh-portable/blob/V_10_2_P1/sshkey.c#L764-L777)

最小验证用合成 Ed25519 公钥，在策略层断言同一受撤销 leaf 的两种编码及续签结果均为 `revoked`，保留另一 leaf 和不适用端口的成功对照。此项是 `known_hosts` marker 语义，未涉及 KRL。

### P1 · 主机 CA 路径跳过合法的 OpenSSH pin

Huhu 的设计要求适用地址上的既有 pin 继续约束证书叶公钥。校验成功后进入 `fingerprintVerdict`，该函数跳过哈希主机和逗号列表，通配 pin 也只按字面字符串比较。OpenSSH 允许这些格式用于无 marker 的主机公钥行。匹配的 CA 行使用完整模式匹配，因而对同一地址可能得到「CA 匹配、没有 pin」，使由此 CA 签发的另一叶公钥被接受。常规 Huhu 单地址生成的精确 pin 仍能拦截。 [普通行解析](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/known-hosts.ts:21) · [证书路径的 pin 比较](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/known-hosts.ts:64) · [marker 地址解析](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/known-host-rules.ts:46) · [已接受设计](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report02.md:51) · [OpenSSH known_hosts 格式](https://man.openbsd.org/sshd.8#SSH_KNOWN_HOSTS_FILE_FORMAT)

最小验证使用同一个匹配 CA 和两把合成叶钥，对字面、哈希、含否定项的列表和非默认端口分别断言 pin 适用性。已有 pin 与有效证书叶冲突时应得到 changed-key，且进入用户认证的次数为零。

### P2 · rekey 的身份拒绝丢失跳点和可操作原因

初始握手对 changed key、撤销、过期等有结构化拒绝。rekey 会重读当前规则并检查原叶公钥和 CA；`accepted` 分支只向 ssh2 返回布尔值。此时连接 Promise 已完成，通用 error handler 的 `finish` 直接返回。连接最终只报普通断开，工作台及外部状态无法区分哪一跳因换钥、CA 撤销、证书过期而关闭。日志里的 Linux rekey 持续使用同一证书，错误 CA 和撤销叶钥在断开后的新连接上检查。 [rekey 判定](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:854) · [握手回调生命周期](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:674) · [工作台断开状态](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:1062) · [外部断开状态](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/public-probes.ts:162) · [现有真实夹具](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/test/identity-certificate.test.ts:411)

最小验证在隔离回环连接已就绪后更新撤销策略，由原夹具触发 rekey，断言原传输关闭、准确跳点与原因可读取，且没有新信任待答。另保留相同叶钥、相同 CA 的续签对照。

## 规范与权限问题

### P2 · 批准时地址和端口可以编码到另一地址的范围

添加能力锁定主机目录并复核主机版本，随后把主机字段和端口拼成 `known_hosts` token。主机编辑接受含括号和端口组成的主机字段，`addAuthority` 的字符排除也允许这些字符。这样一个以 22 为端口的无效主机条目，可能写出与另一合法主机的非默认端口相同的 token。桌面表单展示选中条目的两个字段，最终激活的 CA 规则却可影响另一地址与端口。 [主机字段校验](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/hosts.ts:23) · [桌面批准的版本锁](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/host-authorities.ts:68) · [端口编码](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/known-hosts.ts:17) · [批准信任范围的校验](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/known-hosts.ts:148) · [界面显示](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/HostAuthoritiesPanel.tsx:124)

最小验证在单元策略中断言选中端点可无歧义地往返编码，含端口的非法主机字段在落盘前被拒绝。对默认端口、非默认端口和正常 IPv6 保留独立范围断言。

### P2 · Web 的通用文本读取暴露桌面专属 CA 列表内容

三个 CA 能力标记 `desktopOnly` 且不可外部开放，handler 再校验 caller。正常可写 Vault 将 CA、公钥 pin 和撤销规则放在同一个内部信任文件。共享 Web 会话作为 `web:<id>` 进入 Dispatcher，也是 `isWorkbenchCaller`。通用 `vault.readFile` 因此跳过受保护文件检查，直接用仅校验 Vault 路径边界的 `VaultFiles.read`。这样受邀浏览器可以读取受保护的 CA 规则与地址范围，超出 CA 列表的桌面权限。此追踪确认的是读取边界，CA 批准与移除仍有桌面保护。 [CA 描述符与 handler](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/host-authorities.ts:10) · [SSH 信任文件](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/index.ts:67) · [Vault 状态目录](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/vault/src/vault.ts:104) · [Web 主体](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/kernel/src/server/web-share.ts:35) · [工作台分类](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/contracts/src/capability.ts:31) · [通用文本读取](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/kernel/src/capabilities/vault.ts:262) · [文件路径守卫](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/vault/src/write.ts:49) · [受保护目录定义](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/vault/src/paths.ts:7)

最小验证用隔离 Vault 的合成规则，断言受邀 Web 的直接 CA 能力及通用路径读取都不返回规则，CA 增删拒绝且信任文件版本保持不变。桌面批准和既有工作台连接作为对照。现有新增权限测试用了 CLI 和 HTTP MCP。

### P3 · 主机改版后，批准弹窗仍提交旧主机版本

批准弹窗打开时固定候选主机对象。外部变更所选主机但信任文件版本未变时，Engine 合理拒绝旧主机版本；UI 失败后只刷新信任列表，按钮的版本阻塞也只比较信任版本。用户可以重复提交同一过期主机版本，只有关窗重开才取得新对象。 [弹窗候选快照与失败后刷新](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/HostAuthoritiesPanel.tsx:21) · [提交与版本阻塞](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/HostAuthoritiesPanel.tsx:51) · [按钮使用快照](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/HostAuthoritiesPanel.tsx:73) · [Engine 主机版本检查](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/host-authorities.ts:68)

最小验证在批准弹窗挂起时改动所选主机，观察版本冲突后是否明确提示重新选择和核对地址，且不会用新版本自动重放旧批准。

## 核对证据

- **KEX 与默认协商。** 锁版 ssh2 的客户端把来自 wire 的完整 `K_S` 交给哈希和 Huhu verifier；证书分支只在验证 `H` 签名时提取 Ed25519 叶公钥。Huhu 分别用已批准 CA 验证到签发公钥字段为止的证书原字节，并核对类型、principal、有效期和 critical options。证书算法只加入 supported 列表。适用 CA 规则时 Manager 的 KEX offer 只允许 Ed25519 证书，verifier 也会拒绝适用 CA 规则下的裸钥，匹配的裸 pin 无法放宽它。rekey 对证书重验并比较同一个叶公钥及 CA。 [固定 ssh2 补丁](/home/wta/projects/huhu/temp/issue-worktrees/integration/patches/ssh2@1.17.0.patch:116) · [锁版 KEX 的完整 K_S](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/node_modules/ssh2/lib/protocol/kex.js:590) · [证书 CA 签名](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/host-certificate.ts:109) · [Manager KEX offer](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:841) · [RFC 5656 §4](https://www.rfc-editor.org/rfc/rfc5656.html#section-4) · [RFC 4253 §9](https://www.rfc-editor.org/rfc/rfc4253.html#section-9) · [OpenSSH 10.2p1 的 CA 验签](https://github.com/openssh/openssh-portable/blob/V_10_2_P1/sshkey.c#L1838-L1852)
- **写入与已有覆盖。** 桌面 CA 写入使用主机目录锁、主机修订校验和信任文件版本 CAS。CA 增删传入提交前取消检查。两份指定日志分别记录 42 项和 22 项通过，含 SSH 类型检查、真实 Linux OpenSSH 同连接 rekey、错误 CA、裸叶公钥撤销，以及 CLI 和 HTTP MCP 的能力开放限制与桌面版本冲突。既有 rekey 用例记录多次 NEWKEYS 和同一 connection 状态。 [CA 信任文件写入](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/known-hosts.ts:148) · [Vault 事务提交](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/vault/src/write.ts:128) · [首次日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/h7-host-ca-check.log) · [复检日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/h7-host-ca-recheck.log)
- `git diff --check` 通过。此轮只读审查，未运行测试、构建或远端连接。其他算法、KRL、桌面实际操作和上面的建议用例均待验证。

`hc get t4t` 在沙箱中因 Core 锁目录只读失败。本机身份、topic 和 manifest 指针已核对。
