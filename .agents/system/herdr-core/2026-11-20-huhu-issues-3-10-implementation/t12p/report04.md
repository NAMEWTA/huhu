# #7 H2.2 / #9 P5.1 · SSH 主机配置与自有凭据

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t12p`
- task — `task04.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/task04.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/report04.md`
- 执行结果 — `done`

## 结论

SSH 现在可通过桌面管理能力一次发布带独立修订的主机定义及本机凭据。Windows 上由真实 Engine 按 hostId 连接合成回环服务，验证密码和加密私钥在 Safe 未初始化、锁定、停用三种状态均可连接，并实测单个本机身份文件取用。拒绝首次信任、错误或已清空的私钥口令、新目标尚未绑定凭据时，夹具没有收到认证请求。

## 候选与改动范围

- 本地候选 `657428876632f9a420f321a7b1c85a559dc0633a`，直接父 `5bbc27240f3a249f5e1871d7da2cc8bb1fce5542`，分支 `impl/huhu-issues-3-10-ssh-host-auth`，提交后检出干净。
- 复用原 SSH 主机目录、跳板检查、连接管理器、Windows Engine 原生凭据宿主与 `ModuleCredentials`。SSH 自有定义的认证目标绑定主机、端口和用户名。更换目标后，旧密码不能用于新目标。正在连接时按冻结的配置版本复核，发起新连接时根据实际路由及修订判断是否可以复用连接。
- 旧 `ssh.hosts.save` 和旧 Safe 引用保留过渡行为。由 SSH 自有配置管理的 hostId 只能通过新版配置获得凭据。现有分组和标签继续使用 SSH 目录。备份可恢复定义，独立恢复的本机实例显示凭据需重新配置。
- Engine 装配仅在 `apps/engine/src/boot.ts` 调用 `ssh.apply` 时传入现有原生凭据宿主和 Vault。其余改动在 SSH 插件。未改前端、待确认原型、根锁、其他工作树或远端。

## 桌面管理契约

| 能力 | 输入与结果 |
| --- | --- |
| `ssh.hosts.configure` | 创建传 `expectedRevision: null`。更新传稳定 `hostId`、已读版本、完整非秘密主机字段及可选 `credentials` 补丁。补丁按用途支持 `keep`、`replace`、`clear`，省略保留适用凭据。回执为 hostId、revision、authKind、configured 与按用途的 authState。 |
| `ssh.hosts.copy` | 按源 hostId 与版本复制定义，生成独立 ID 和版本。副本的凭据各自配置。 |
| `ssh.hosts.remove` | 按 hostId 与版本移除。若该主机仍为已保存的跳板则拒绝。成功后断开该主机。 |
| `ssh.hosts.list` / `ssh.connect` | 列表显示主机资料、认证方式和状态。连接使用当前保存的 hostId；管理能力为桌面专用且不对工具公开。CLI、MCP 经 HTTP 验证拒绝，Web 经 Engine 权限分派器验证拒绝。 |

## Windows 验证

| 检查 | 观察 | 日志 |
| --- | --- | --- |
| 父提交红灯 | 两项真实 Engine 用例因 `CAPABILITY_NOT_FOUND` 失败。冻结依赖安装仍在运行时，红灯仅从只读集成检出解析 Mail 的依赖，SSH 和 Engine 源码来自本工作树。 | [red.log](./evidence-task04/red.log) |
| 冻结依赖 | 原生 pnpm 12.10.1 执行 `install --frozen-lockfile --offline`，退出 0。根锁与父提交一致。候选绿灯使用本工作树安装。 | [install.log](./evidence-task04/install.log) |
| SSH 验收 | 5 个文件、44 项通过，含 3 项真实 Engine 原生凭据用例。验证两种口令模式、身份文件、主机信任、复制与删除、冲突、替换发布失败后原凭据仍可用、目标变更后的绑定、分组和重开，以及 keepalive 显式 0 和省略。 | [green.log](./evidence-task04/green.log) |
| 明文排除与备份 | 合成秘密标记未出现在普通列表、能力目录、Vault 和应用本机目录的文件字节或 ZIP 解包内容。敏感配置未写入共享幂等记录。备份恢复的主机不继承本机认证。 | [green.log](./evidence-task04/green.log) |
| 既有过渡回归 | 4 项通过，46 项由筛选跳过。覆盖旧 Safe 解锁后 SSH 连接、Shell WS、能力目录和原生凭据 ZIP 隔离。 | [engine-regression.log](./evidence-task04/engine-regression.log) |
| 静态检查 | SSH 和 Engine 的 TypeScript、改动范围 lint、格式、Git 差异检查通过。根 lint 由父提交已存在的 `plugins/agent-cli/src/engine/dispatch-store.ts:42` 的 `no-control-regex` 阻塞，文件 blob 与父提交相同。 | [SSH TS](./evidence-task04/types.log)、[Engine TS](./evidence-task04/engine-types.log)、[变更 lint](./evidence-task04/lint-target.log)、[格式](./evidence-task04/format.log)、[根 lint](./evidence-task04/lint.log)、[父提交 lint 核对](./evidence-task04/baseline-lint.log) |

```powershell
pnpm install --frozen-lockfile --offline
node .\node_modules\vitest\vitest.mjs run plugins/ssh/test --maxWorkers 2
node .\node_modules\vitest\vitest.mjs run apps/engine/test/engine.test.ts apps/engine/test/module-credential-host.test.ts apps/engine/test/capability-catalog.test.ts -t 'ssh|SSH|凭据' --maxWorkers 2
.\node_modules\.bin\tsc.cmd --noEmit -p plugins/ssh/tsconfig.json
.\node_modules\.bin\tsc.cmd --noEmit -p apps/engine/tsconfig.json
.\node_modules\.bin\oxlint.cmd -c oxlint.json plugins/ssh/src/engine plugins/ssh/test apps/engine/src/boot.ts
git diff HEAD^ HEAD --check
```

## 验证边界

- 真实连接仅限 Windows x64 上自行启动的合成回环夹具。Agent 沿用现有代理接线，未调用实际 Agent。UI 仍待确认，新版管理入口通过桌面工作台客户端验收。多个身份文件及其他高级 SSH 设置属于后续接线。
- 测试清理本机测试配置和合成凭据，关闭临时 Engine、SSH 服务器并移除隔离 Vault。所有命令会话均已结束。

## Lead 验收

