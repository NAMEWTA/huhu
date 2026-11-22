# 任务报告 · #6 G1.2 静态能力目录独立审查

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t20
- task — task04.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report04.md
- 执行结果 — done

## 结论

建议修复卸载后的调用判定再签收 G1.2。Notes 和 SSH 的启停主路径通过，桌面管理目录在停用后保留已迁移工具的完整说明。CLI HTTP 和 MCP stdio 停止发现该工具，缓存名称仍能得到 `PLUGIN_DISABLED`。实际卸载后，目录与调用对同一 ID 的判定出现分歧。公共 Registry 还接受可变描述对象，存在描述与活动处理函数校验分离的接口缺口。

### 规格轴

1. **P2 · 卸载后，目录判定不存在，CLI 仍返回插件已停用。** 在隔离 Engine 安装无业务动作的测试扩展，清单仅声明 `review-catalog-example.read`。安装前调用是 `CAPABILITY_NOT_FOUND`，安装并启用后管理目录显示 `handler-missing`，停用后目录显示 `plugin-disabled` 且调用返回 `PLUGIN_DISABLED`。经正常 `plugins.uninstall` 卸载，管理目录移除该 ID，`gateway.check` 返回 `found:false / not-found`，同一 Engine 上的打包 CLI 却仍以退出码 1 返回 `PLUGIN_DISABLED`。重开同一个 Vault 后才返回 `CAPABILITY_NOT_FOUND`。G1.2 验收第 2 项要求区分未安装与已安装但停用。当前卸载只移除 PluginManager 状态，Registry 保留清单 owner，Dispatcher 用 `knownPlugin` 和 `!isPluginEnabled` 将两个状态合成同一错误。Dispatcher 查找逻辑继承自父提交，本切片新增的状态投影把分歧呈现给调用者。建议统一卸载与缺失的判定，并在同一个 Engine 上回归目录、诊断及调用。定位为 `packages/kernel/src/plugins/external.ts:338–350`、`plugin-manager.ts:143–147`、`capabilities/system.ts:42–48,223–238,253–260`、`dispatcher.ts:64–71`。
2. **通过的主路径。** 用同一合成笔记测试 `notes.read`。活动状态下桌面 HTTP、打包 CLI、MCP stdio 返回同一正文、路径和文件版本。停用后管理目录保留 title、description、owner、scope、risk 和输入输出 Schema，开放状态为 false。CLI bearer 的 `GET /api/v1/capabilities` 与 stdio 的 `tools/list` 移除该项，CLI 及 stdio 对原工具名的调用仍返回 `PLUGIN_DISABLED`。已连接的 stdio 收到工具列表变更通知。再次启用后目录与 CLI 读取恢复，笔记文件内容一致。候选自带的 Engine 用例另外覆盖 21 项 SSH 描述、同 Vault 重启后的停用状态、恢复 handler 和空合成主机列表。

### 规范轴

1. **P3 · Registry 未在公共边界固定静态描述。** `CapabilityDescriptor` 是结构类型，`declareDescriptors` 保存传入引用，`bindCapability` 则复制当时的字段后冻结 handler 对象。用一个类型可赋值的普通描述登记并绑定，再把原对象的 `input` 从任意字符串改成最小长度 5 的 Schema，此时 `getDescriptor(name).input` 拒绝 `{path:"a"}`，活动 handler 接受。引用相等检查仍成立。管理目录优先从描述转换 Schema，HTTP 发现和实际 Dispatcher 从活动定义读取，因而公共接口允许两者发生漂移。现有 Notes、SSH 均经 `defineCapabilityDescriptor` 冻结，当前样例没有此漂移。建议登记边界保证描述不可变，并保留同源绑定校验。定位为 `packages/kernel/src/capabilities/define.ts:44–51,64–83`、`capabilities/system.ts:262–275`、`server/http-app.ts:129–135` 和 `dispatcher.ts:76–80`。
2. **登记与迁移证据。** 候选单测通过批内重复、归属冲突、异源 Schema 及重复活动 handler 拒绝，注销后描述保留，旧注销函数不能删除新 handler。`context.ts:98–101` 继续检查实际插件身份。独立语法树比对确认 21 项 SSH ID 与 manifest 一致，scope、输入输出 Schema 表达式、超时和 handler 与冻结父提交一致。

## 产物与改动

- 基线 `2dfd76240dbf8edc87310820b427452406d52635`，候选 `6e6240d5573dcf0c825680a7d0dfcb6ccf971a4e`，候选树 `c7d7aa890122a9ee816df8875cbc7d639392073f`。候选直接以基线为父提交。已读全部九文件差异，含新增的 Engine/Kernel 两个目录测试及 SSH 静态描述。
- 已读 `t1c/report02.md`、#6 spec、plan、G1.2 和冻结 G1.1 盘点。核对 Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`、`HC_TERMINAL_ID=t20`、`t20 / task04.md / active` 和同号终稿路径。
- 用 `git archive` 从候选 SHA 提取业务代码到 `C:/Users/cdewta/AppData/Local/Temp/huhu-t20-r4-547f966755974688a6c48604c82ecbab`。本地 workspace 依赖链接到该快照，其余复用集成检出的锁定依赖，已核对根锁相同。审查期间 receipt 工作树出现并行的 Agent CLI 改动，取证始终使用固定 SHA 的隔离副本。共享目录仅写入本报告。使用独立测试 Vault、合成笔记、无业务副作用的本地扩展和回环 Engine。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 定向回归 | 冻结候选的 Engine 目录、Kernel 目录、Dispatcher、HTTP 四文件共 35 项通过。 | 临时根执行 `node ./node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1`，使用临时 `vitest.config.mjs`。 |
| 跨入口场景 | 从冻结的 `apps/cli` 运行 `node scripts/build.mjs`，所得 `dist/cli.mjs` 连接真实 Engine。独立三项测试复核 Notes 启停，复现卸载分歧和可变描述漂移。 | 临时根执行 `node ./node_modules/vitest/vitest.mjs run --config review-cross-entry.config.mjs --maxWorkers=1 --minWorkers=1`。入口和输入记录在 `apps/cli/test/t20-capability-review.test.ts`。 |
| stdio 发现、错误和反射 | `apps/cli/src/mcp.ts:15–26` 从 `capabilities.list` 读取活动开放项和缓存名字提示，调用经同一 HTTP Dispatcher。SDK 实测输入 schema 的 properties 和 required 与桌面相同，响应为现有文本 JSON。工具说明仍由 ID、owner、scope 拼接，输出 schema 和 structuredContent 尚未发布。未知工具走现有通用错误。列表变化发送通知，签名仍只比较工具名称。 | 临时独立测试及 `packages/kernel/src/mcp.ts:33–68`。 |
| SSH 迁移 | 21 项描述与 manifest、原 scope、schema、timeout、handler 一致。 | 临时 `review-ssh-ast.mjs`，从本仓库执行该脚本读取冻结父提交。 |
| 类型及范围 | 构建三个 vendor 类型声明。Contracts、Kernel 包级检查及包含 Engine、Kernel、Contracts、Notes/SSH Engine 源的定向类型检查通过。完整 Notes 包检查依赖未解包的 Workbench/UI/Editor，定向复测覆盖本次改动的 Notes Engine。最初通用 Vitest 配置找不到未提取的 perf workspace，独立探针缺少根 Zod 链接，补齐临时配置及链接后全部完成。 | Node 24.21.0、Vitest 3.2.7，临时 `node ./node_modules/typescript/bin/tsc -p review-engine.tsconfig.json` 退出 0，`git diff --check 2dfd762...6e6240d` 通过。 |

## 阻碍与接续

建议在签收前解决卸载后的不一致，公共描述固定后复查绑定与导出。G2.1–G2.3 负责零默认开放、Vault 策略持久化、批量并发和统一授权重判。本次沿用候选既有开放策略。G3.1/G3.2 承接 CLI 发现入口及 MCP 独立发现、完整反射、结构化结果、同名 Schema 变化通知和服务开关。G4 承接用户确认后的 Renderer 管理视图。真实 SSH 主机及完整桌面界面在对应验收切片取证。

## Lead 验收

由 Lead 追加。
