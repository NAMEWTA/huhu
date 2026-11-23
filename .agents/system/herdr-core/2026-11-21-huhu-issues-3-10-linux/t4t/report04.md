# #7 首段出站代理独立审查

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`，Core `wta-ubuntu`，Lead `t3p`，worker `t4t`。
- `t4t/task04.md` → `t4t/report04.md`。任务完成。审查固定 `31352cae87ad11d5f12c7a3d125bc2fe8aee5189` 对父提交 `a8bcd145`，代码证据取自固定提交。

## 规格问题

### P1 · 代理路由更新后，外部作业仍持有旧连接

代理保存、默认项变更和移除发布 `ssh-outbound-proxy` 变更，订阅者调用 `revalidateConnections()`。该方法只重验 `kind === "connection"`，因此跳过 `openForJob()` 打开的独占传输，也跳过单次连接核验。作业在认证后进入 `ready`，下一次 `jobs.start` 会拒绝旧路由并关闭连接；若没有这次调用，旧传输可额外保留 60 秒。已经运行的作业可以继续占用旧传输，直到自身退出或超时。单次核验如果正在等人工确认，旧待答拒绝继续，底层传输仍可留到等待超时。主机授权撤销有独立的全类中止路径，这里的缺口出现在路由版本变化。 [变更订阅](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/index.ts:145) · [作业连接](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/public-probes.ts:201) · [路由重验](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/public-probes.ts:304) · [作业就绪与启动](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/public-jobs.ts:174) · [授权撤销](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/public-probes.ts:389)

验证建议：沿用现有 CLI 和 HTTP MCP 回环夹具，分别在信任待答、作业已就绪、作业运行时修改当前使用的代理，观察旧链路关闭和后续跳数、Exec 数，并核对终态。保持一个使用其他代理或显式直连的对照。运行中的远端命令只依据真实退出回执判定结果。 [当前三跳用例](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/test/public-resources.engine.test.ts:319)

### P2 · 「下次连接路径」漏掉实际首段代理

Engine 按目标主机的策略选择首段传输，有跳板时将首个跳板作为代理目标。「下次连接路径」只从主机目录推导跳板与目标，默认代理、主机覆盖、显式直连三种配置的路径画面相同。用户拨号前看不到本地到首跳是否经过代理。拨号详情能显示选中的代理或显式直连，继承空默认项时则没有来源或直连标签，因为这一情况的版本标记为 `undefined`，Manager 同时省略了显示字段。 [H3.3](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H3.3-route-attempt.md:5) · [代理解析与版本](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/outbound-proxies.ts:51) · [路由快照和拨号](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:423) · [界面路径](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/SshModule.tsx:569)

验证建议：对同一个多跳目标分别选择继承已配置默认项、主机指定、显式直连和继承空默认项，核对拨号前的页面、实际连接详情和首段观测。默认项更新后核对正在使用的连接仍按其快照展示。

### P2 · 带凭据的代理握手成功后，取消要等凭据队列才释放套接字

协议层成功交接时撤下 abort 监听。带凭据路径随后由 `ModuleCredentials.use()` 等待同一凭据队列执行解除固定和清理，`SshManager` 必须等该步骤完成后才取得流、复查 deadline 并销毁已取消的流。这个间隔内如果另一代理保存占住凭据队列，取消、退出或 deadline 已触发，代理侧仍可看到已建立的活动 TCP；已有 ssh2 Client 此时尚未绑定这个套接字。协议层对 SOCKS5 延迟交接的测试覆盖了更早的窗口。 [协议层交接](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/outbound-proxy-dial.ts:91) · [带凭据的拨号包装](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/outbound-proxies.ts:163) · [凭据归还队列](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/kernel/src/credentials/module-credentials.ts:419) · [Manager 接管](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:453) · [协议层取消用例](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/test/outbound-proxy-dial.test.ts:354)

验证建议：用隔离夹具挂起握手成功后的凭据清理，分别对带认证的 SOCKS5、HTTP CONNECT 触发取消，断言清理解除前即观察到代理套接字关闭，后续 SSH 身份验证未启动。

## 规范与并发问题

### P1 · 外部主机保存到提交之间仍有撤权窗口

外部 `ssh.hosts.configure` 的授权重新读取当前逐跳选择和路由版本。新的代理版本已进入路由版本，因此修改代理会令旧绑定失效。实际最后一次授权检查在调用异步 `owner.save()` 前。凭据保存会排队、暂存凭据，再写可移植定义。该写入没有携带提交前授权检查。若授权在这个间隔被撤销，定义与认证修改仍可提交，而 `HostIntents` 最后检查权限时可能才向外部调用者返回拒绝。若授予的主机集合未变但有效代理改版，旧路由保存仍可返回成功。主机修订 CAS 无法覆盖独立的授权和代理版本。 [外部绑定检查](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/index.ts:568) · [代理纳入路由版本](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/public-resources.ts:147) · [主机调用保存](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/host-configurations.ts:189) · [回执及授权](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/host-intents.ts:83) · [凭据落盘](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/kernel/src/credentials/module-credentials.ts:254) · [Vault 提交点](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/vault/src/write.ts:128)

同一提交时机也影响桌面代理资料的取消。代理 `save`、`remove` 把 signal 交给凭据 API，底层在写前检查 signal，但 `save` 和 `delete` 调用 `#publish` 时均未传入它。取消可以出现在检查后、文件提交前，保存或移除仍会落盘。主机目录锁与代理操作队列已防止正常能力入口的并发引用和移除留下悬挂引用。 [移除持有主机目录锁](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/outbound-proxy-capabilities.ts:69) · [代理移除校验](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/outbound-proxies.ts:152) · [凭据删除与提交钩子](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/kernel/src/credentials/module-credentials.ts:364)

验证建议：在隔离 Vault 的定义发布点加同步控制。分别在发布前撤销某一跳授权、改版所用代理，断言主机修订、凭据引用和成功回执没有改变。用桌面代理 save/remove 的取消做同样断言，并用成功先于取消的次序核对真实落盘结果。

### P3 · 默认代理版本冲突后，重复保存仍使用旧版本

默认选择保存了用户修改时的版本。冲突处理刷新 profile 和 routing 查询，保留 `selected` 中失效的版本；保存按钮继续可用时，重复点击使用相同旧版本，直到用户重新改变下拉选择或离开页面。另一个桌面窗口先提交不同默认选项时可以触发。 [默认选择与冲突刷新](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/OutboundProxyPanel.tsx:19) · [保存使用草稿版本](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/OutboundProxyPanel.tsx:90) · [Engine 版本检查](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/outbound-proxies.ts:139)

验证建议：双窗口选不同默认项，先提交一个窗口，断言另一个窗口显示当前值及待提交选择，有明确的恢复操作，并且不会在用户未确认的情况下覆盖新值。

## 核对证据

- **Web 设备路径。** 复核修正了 report03 对实际入口的判断。固定提交的主机创建和编辑入口在 UI 由 desktop 宿主控制，`ssh.hosts.configure` 描述符继承 `desktopOnly`，Web 在 Dispatcher 即被拒绝。新增的 Web handler 检查是后备约束。草稿与配置同步路径也受桌面限制。建议真实 Web 分享会话用合成路径核对权限拒绝及零凭据、目录副作用。 [桌面表单](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/ui/SshModule.tsx:811) · [能力描述符](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/capabilities.ts:698) · [Dispatcher](/home/wta/projects/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:352) · [草稿](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/draft-connection.ts:12) · [配置同步](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/config-sync.ts:235)
- **已有覆盖。** Lead 日志记录 36 项传输测试通过，CLI 与 HTTP MCP 三跳各一项通过，SSH 与 Engine 类型检查以及 33 项相邻回归通过。三跳用例覆盖初始旧绑定拒绝、仅目标授权时零代理流量、完整授权后逐跳信任，并确认代理只收到首个跳板。它在改配置后核对修订及移除结果，未断言旧传输已关闭。源码确认每跳用各自主机和端口校验指纹、成功认证后才打开下一跳 `direct-tcpip`。代理状态的概要字段和固定错误、凭据的独立受保护存储未发现明文输出路径。 [逐跳校验与转发](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:467) · [指纹校验](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/manager.ts:806) · [协议错误映射](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/ssh/src/engine/outbound-proxy-dial.ts:16) · [传输与 CLI/MCP 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/h7-first-proxy-recheck.log) · [相邻回归日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/h7-first-proxy-regress.log) · [传输交付与验收](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report05.md)
- 本轮为静态审查，`git diff --check` 通过。建议的控制时序和 UI 观察均未执行。已有证据范围止于首段出站 SOCKS5/HTTP CONNECT。ProxyCommand、ViaShell 和桌面 UI E2E 仍待各自的验证。未修改代码、启动测试或写入远端。

`hc get t4t` 在沙箱中因 Core 锁目录只读失败。本机身份、topic 和 manifest 指针已核对。

## 首轮返工

已对照实际提交和路径检查。`e5b12ee1` 在 Vault 定义发布点复核旧路由和取消，代理变化立即中止所有陈旧公开 SSH 传输。专用作业在运行期间保持注册。CLI、HTTP MCP 四项红转绿。认证代理流在凭据归还前接到取消也会销毁。下次路径显示和冲突恢复单独修改，真实 UI 尚待验证。
