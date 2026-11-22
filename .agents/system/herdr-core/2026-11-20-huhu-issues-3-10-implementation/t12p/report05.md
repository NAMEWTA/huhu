# #9 P4.1 · Versioning 的 Git HTTPS 自有认证

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t12p`
- task — `task05.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/task05.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/report05.md`
- 执行结果 — `done`

## 结论

Windows 上通过真实桌面工作台调用、原生 `ModuleCredentials` 和系统 Git，对隔离回环仓库执行了 fetch/push。Safe 未初始化、锁定或停用时，已配置的 Versioning 自有认证仍可用。协议、主机、有效端口和仓库是绑定的一部分。单独改变任一维度均需在新目标配置认证。跨主机及同主机换仓库的重定向被阻止。远端拒绝后的错误为脱敏摘要，取消后的连接关闭且 ASKPASS 文件被清理。

## 提交与范围

- 候选 `f5a92e68df2ba655e9c888ddb9e61460cd69a4aa`，直接父 `8ee7643d83cadcae1f19e991ff1ae83d0657fe6e`，分支 `impl/huhu-issues-3-10-versioning-auth`。提交后工作树干净。
- 共 9 个文件，主要位于 Versioning。Engine 装配仅在 `apps/engine/src/boot.ts` 将现有原生凭据宿主传给 Versioning opts。沿用 Windows Git 2.47.1.windows.2 与锁定工作树依赖，未改根锁、前端、原型、其他工作树或任何真实 Git 配置。
- 主配置保留无秘密远端。HTTP(S) 目标归一化默认端口和仓库路径，拒绝 URL 中的认证材料、查询、片段与歧义路径。配置变更后以该目标与凭据绑定比较。在每次 Git 调用使用实际目标检查、关闭重定向、系统 credential helper 和相关 HTTP 认证旁路。
- Windows ASKPASS 每次 Git 调用创建静态脚本和独立命名管道。请求只包含该次操作的 nonce 及请求字段，脚本先校验 Git 提示的目标和账号。响应经短命管道和 ASKPASS 标准输出交给该次 Git 认证。密码或令牌未进入脚本、Git argv、Git 子进程环境、配置或常规错误日志。Git 生成的 Password 提示可以带该次临时账号名。现有 SSH URL 维持系统 SSH/agent 路径，旧 Safe 引用继续服务过渡配置。

## Engine 入口

- `sync.update` 保存远端和同步设置。新版用户名及令牌由桌面专用 `sync.auth.configure` 接收，输入为当前远端、`expectedRevision` 和 `credential` 的 `keep`、`replace` 或 `clear` 动作。首次版本为 `null`。新目标的状态通过 `sync.auth.get` 获取。状态和回执仅返回 `revision`、`state`。
- 旧 Safe 引用仍存在时先通过既有设置清除，再配置自有凭据。新版写入走桌面管理能力，跳过通用幂等输入摘要。CLI 经 HTTP、Web 经权限分派器验证不能写入。能力目录和普通设置中未发现合成用户名或令牌。
- Workbench UI 仍待确认。新版认证修复后自动恢复同步是 P4.2 的交付范围。真实 SSH/agent 服务器及发布包在本轮未实测。

## Windows 验证

| 检查 | 观察 | 证据 |
| --- | --- | --- |
| 父提交红灯 | 新版工作台能力返回 `CAPABILITY_NOT_FOUND`。 | [red.log](./evidence-task05/red.log) |
| 候选绿灯 | Versioning 共 7 个文件，69 项通过、1 项按 Windows 基线跳过。含两个实接 Windows Engine 与真实 Git 的回环用例及一个目标归一化用例。回环 HTTP 和受信测试证书的 HTTPS 均验证真实 fetch/push。最终候选首次并行复跑有 2 项既有 history 用例触及默认 5 秒超时，使用命令行 30 秒超时复跑通过。 | [green.log](./evidence-task05/green.log)、[首次并行超时](./evidence-task05/parallel-timeouts.log) |
| 边界和清理 | 实测四种目标变化、两个重定向方向、拒绝、取消后 socket 关闭、下一次正常调用，以及 ASKPASS 临时目录删除。改用捕获本次 launcher 路径复验原有 Safe 引用的清理，避免其他测试的并发目录干扰。 | [green.log](./evidence-task05/green.log) |
| 明文排除 | 实查 Git argv 和 env（启动子进程前）、配置、共享幂等文件、短命 launcher、受控错误和提交树。继承的 curl trace 配置未产生日志。证据只记录断言和结果。 | [green.log](./evidence-task05/green.log) |
| 原生宿主回归 | 1 项原生凭据宿主通过，48 项由名称筛选排除。 | [engine-regression.log](./evidence-task05/engine-regression.log) |
| 静态检查 | Versioning 与 Engine TypeScript、改动范围 lint、格式及 Git 差异检查通过。全仓 lint 仍报父提交已有的 Agent CLI `dispatch-store.ts:42` 的 `no-control-regex`，文件 blob 与父提交一致。 | [Versioning TS](./evidence-task05/types.log)、[Engine TS](./evidence-task05/engine-types.log)、[变更 lint](./evidence-task05/lint-target.log)、[格式](./evidence-task05/format.log)、[全仓 lint](./evidence-task05/lint.log)、[父提交核对](./evidence-task05/baseline-lint.log) |

```powershell
node .\node_modules\vitest\vitest.mjs run plugins/versioning/test --maxWorkers 2 --testTimeout 30000
node .\node_modules\vitest\vitest.mjs run apps/engine/test/module-credential-host.test.ts apps/engine/test/engine.test.ts -t 'Windows|同步|Git|文件历史' --maxWorkers 2
.\node_modules\.bin\tsc.cmd --noEmit -p plugins/versioning/tsconfig.json
.\node_modules\.bin\tsc.cmd --noEmit -p apps/engine/tsconfig.json
.\node_modules\.bin\oxlint.cmd -c oxlint.json plugins/versioning/src/engine plugins/versioning/test apps/engine/src/boot.ts
git diff HEAD^ HEAD --check
```

测试结束后已清除合成凭据，关闭本轮的 Engine、回环服务器和临时 Git 进程。未新开验证 pane。

## Lead 验收

