# task21 报告 · #9 P10.1 保险箱工具

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task21.md`
- 报告文件 — `t17c/report21.md`
- 执行结果 — `done`，公共装配见下文

分支 `impl/huhu-issues-3-10-safe-tools`，基线 `04bd14e41e04449975a656f91010cac7b0e62a2b`。提交范围为 Safe 插件、插件夹具及 #9 证据。工作树干净。

| 提交 | 交付 |
| --- | --- |
| `1d9f686d55bd78361c843033698626a27cfd2970` | Windows 测试专用旧库与旧条目生成器，保留真实的元数据形状和加密绑定 |
| `0b1f7395ea3d23c23a799b4771c6249eb6c73ed1` | 个人工具、独立明文读取、旧 service 与旧接口退出 |
| `c971b9ab6ff987fd0ce536776344e23c1d346e4d` | 实际 Windows 桌面、Web 和组合证据 |

## 已交付

- 桌面、已登录 Web 和获权外部工具使用相同个人条目、账号、标签和生命周期 handler。外部默认关闭。普通条目读只显示 `hasPassword`，显式 `safe.accounts.reveal` 按指定账号独立授权。旧条目和主密码没有明文接口。
- 外部工具先按自己的身份读取已开放的 `safe.status`。把返回的 `instanceId`、`generation` 和 `callerProof` 作为接下来调用的 `session`。证明绑定认证入口及主体。新 Vault、重启、锁定及再次解锁会使旧会话失效。旧桌面宿主的无参数锁定继续可用。
- Safe 在解密前、暂存后发布前及返回结果前复查实时工具策略和解锁代。旧修订重交得到版本冲突。明文重交读取当前密码。个人写入采用 `idempotency: "handler"`，敏感操作不进入共享输入摘要、持久意图和结果缓存。
- 删除 Safe 对 `secretUse` 的生产注册、`safe.items.*`、`safe://` 解析器及可新增旧权限的入口。旧 keyring、元数据及密文逐字保留。D01 扫描未发现模块消费方或借 `safe.unlocked` 恢复认证。公共源码还留有历史注释及失效查询前缀，位置见下文。

## Windows 实证

- Safe 全量 4 个文件、36 项通过。真实回环 Engine 让桌面 HTTP、通用 API、CLI 子进程、MCP HTTP 与 MCP stdio 串行修改同一个合成条目。CLI 通过 `--input-file -` 更新账号密码，命令参数、共享持久回执和验收资料均无合成明文。HTTP 主体切换、同键重交、换 Vault、MCP 旧工具名及 Web 邀请撤销均已验证。注入在途写入和读取停顿后，撤销或锁定均挡住旧结果。
- SSH 自有密码在 Safe 未初始化、锁定和停用状态下保持可用。Git HTTPS 的回环认证修复测试通过，Safe 解锁没有引发新请求。TypeScript、格式、lint 与 Git 差异检查通过。
- Electron 生产构建成功。标准渲染器启动时，`packages/workbench/src/contributions.ts` 因 `widget:automations:summary` 缺少来源抛错。临时生成资源仅绕过该项后，桌面多账号、窄窗、标签管理及补齐写入幂等键的标签筛选均通过。隔离浏览器通过 Web 邀请登录、初始化和重新解锁。五项界面复验结束后，生成资源恢复原字节。标准组合版桌面启动及 Windows 安装器待集成验证。 [详细证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-9-safe-accounts/evidence-P10.1-safe-tools.md)

## Lead 装配

1. 在 `apps/engine/src/boot.ts` 的静态描述区调用 `registry.declareDescriptors("safe", safe.safeCapabilityDescriptors)`。注册 Safe 时调用 `safe.apply(ctx, api, { catalogDeclared: true })`，使活动绑定与停用目录共享同一描述。静态 `safe.accounts.reveal` 是 `scope: "read", risk: "high"`。未装配的旧目录按 scope 推断风险，所以当前动态绑定以 `admin` 将显式读取排除在普通只读批量范围。装配时在 `packages/workbench/src/gateway/ToolPolicyCatalog.tsx` 及 `packages/kernel/src/capabilities/system.ts` 的批量处理保留逐项显式开放明文读取的边界。普通或自动扩展的批次应跳过该 ID。批量停用可包含它。
2. `packages/kernel/src/server/tokens.ts` 的普通 bearer principal 目前只有 caller 和 subject。为每个有效 bearer 提供可撤销 signal，在对应令牌撤销时触发。 `server/http-app.ts` 将该 signal 传给共享 `registerCapabilityHttp` 及直接 `/mcp` 的 Dispatcher 调用。MCP 关停也应中止其已受理调用，并保留普通 API 的独立授权。Web 邀请已有这一机制，实测在途 reveal 的响应无密码。公共 HTTP 能力及 MCP 明文结果响应应使用 `Cache-Control: no-store`，且继续只审计动作、ID、状态，不记录请求或响应正文。Safe 插件只消费已有 `CapabilityContext.signal`。
3. `packages/kernel/src/context.ts` 的旧服务示例注释及 `packages/workbench/src/engine-client/query.ts` 的 `safe.items.` 失效前缀可随装配清除。P3.2 在本基线无可绑定的个人删除实现，本次目录覆盖已存在的个人操作。
4. 旧真实夹具的直接生成路径使用 `plugins/safe/test/legacy-fixture.ts` 的 `writeLegacyItem`。应用于 `plugins/ssh/test/host-auth.engine.test.ts` 和 `plugins/versioning/test/remote-auth.engine.test.ts` 的旧引用回归，并按旧文件字节核对保全。 `apps/engine/test/engine.test.ts` 的当前格式用例改用 `safe.entries.*`， `apps/engine/test/external-plugins.test.ts` 的敏感边界改探测 `safe.accounts.reveal`。 `apps/cli/test/cli.test.ts` 与 `tests/e2e/shell.spec.ts` 的旧永久不可开放断言可改用 `safe.audit.list`，各加单独验证新 reveal 默认关闭。原 Web 桌面提示用例改核对邀请登录后的 Safe。 `tests/e2e/workflows/safe-tags.spec.ts` 的直连写入夹具补 `idempotencyKey`。这些共享夹具留在各自所有者的范围内。
