# #9 P1.2 · 多账号条目加密持久化

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t12p`
- task — `task02.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/report02.md`
- 执行结果 — `done`

## 结论

Windows 上通过现有桌面工作台的 `EngineClient`，一次保存同一条目的三个合成账号。关闭并重开真实 Engine 后，原主密码可解锁，同名账号仍各有稳定 ID，空密码、密码空格、手机号前导零、邮箱和长备注均按契约读回。普通详情仅返回密码存在状态，实际密码由当前解锁代下的指定账号显式读取。

## 候选与改动范围

- 本地分支 `impl/huhu-issues-3-10-safe-personal`，候选 `1910acc01334512552bed252e790d864e10950b3`，直接父 `6b11b63cb6cfae8b2a2f0effe5d64657a203496f`。提交后检出干净。仅改 Safe 插件清单、Engine 和测试 6 个文件。使用原 Windows worktree 和依赖。
- 一个条目及其账号五字段、标签 ID 和时间信息共用一个 AES-GCM 载荷。关联数据绑定格式、库加密身份、条目 ID 和版本。密文落点为 `.huhu/safe/current/entries/<entryId>-<revision>.bin`。清单只保留格式、必要版本、引用和认证数据。
- 复用 `VaultFiles.write` 暂存密文与新清单，读回复核后检查解锁代和原版本，先就位密文，再同步原子替换清单。并发创建使用同一预期清单版本时只有一项成功，另一项得到 `VERSION_CONFLICT`。最终清单发布失败时回收本次密文，旧清单字节保留。若进程在两次重命名之间异常退出，未被清单引用的密文不会被读取或列出。强杀和后续垃圾回收未在本轮实测。
- 个人条目路径与旧 `safe.items.*`、`secretUse` 及 Windows 模块本机凭据独立。正常入口接线在既有 Safe 插件能力注册和清单中完成。四项新能力仅供桌面工作台使用。改动未涉及 Renderer、原型、全局注册代码、根锁、其他工作树或远端。

## 工作台能力契约

所有调用使用 `safe.status` 返回的 `instanceId` 和 `generation` 构成 `session`。锁定、重开或切 Vault 之后的旧请求得到 `SAFE_LOCKED`。

| 能力 | 输入与返回 |
| --- | --- |
| `safe.entries.list` | 接收 `session`。返回清单 `revision` 与条目的 ID 和版本。 |
| `safe.entries.create` | 接收 `session`、清单 `expectedRevision`、名称、可空网址及账号数组。回执仅含 `entryId`、条目 `revision`、`accountIds`、`status: "saved"`。沿用桌面管理能力处理敏感提交，重放由会话与清单预期版本拦截，不进入共享幂等输入哈希或回执。版本冲突后可重读清单。 |
| `safe.entries.get` | 接收 `session`、`entryId`。返回公共资料和账号非密码字段，每个账号附 `hasPassword`。 |
| `safe.accounts.reveal` | 接收 `session`、`entryId`、`accountId`。仅返回指定账号的密码，空密码返回空串。CLI 尝试得到 `CAPABILITY_NOT_EXPOSED`。 |

## Windows 验证

| 验证 | 观察 | 日志 |
| --- | --- | --- |
| 父提交红灯 | 生产代码修改前执行 3 项新用例，均因 `CAPABILITY_NOT_FOUND` 失败。 | [red.log](./evidence-task02/red.log) |
| 候选绿灯 | Safe 3 文件、31 项通过，含 4 项新的真实 Engine 测试。覆盖重开读回、非法输入、两处暂存写失败、最终重命名失败、修正重试、并发冲突、锁定后的迟到写入、密文互换及不可见孤儿。 | [green.log](./evidence-task02/green.log) |
| 明文排除 | 关闭 Engine 后扫描隔离 Vault 的文件字节，断言无合成标记、密码或电话。检查创建不产生共享幂等回执，重开前后真实 `vault.search` 均零命中。证据只记录断言与结果。 | [green.log](./evidence-task02/green.log) |
| 既有 Engine 回归 | 5 项通过，44 项由筛选跳过。覆盖旧 Safe、SSH 引用、诊断、ZIP 和 Windows 本机模块凭据隔离。 | [engine-regression.log](./evidence-task02/engine-regression.log) |
| 静态检查 | Safe 与 Engine TypeScript、根 lint、Safe 格式和暂存差异检查均通过。lint 输出现有 Node DEP0190 提示，退出码 0。 | [Safe TS](./evidence-task02/types.log)、[Engine TS](./evidence-task02/engine-types.log)、[lint](./evidence-task02/lint.log)、[格式](./evidence-task02/format.log) |

复跑命令，在该工作树中执行。

```powershell
node .\node_modules\vitest\vitest.mjs run plugins/safe/test/personal.engine.test.ts
node .\node_modules\vitest\vitest.mjs run plugins/safe/test
node .\node_modules\vitest\vitest.mjs run apps/engine/test/engine.test.ts apps/engine/test/module-credential-host.test.ts -t 'safe|保险箱|导出|导入|backup|凭据'
.\node_modules\.bin\tsc.cmd --noEmit -p plugins/safe/tsconfig.json
.\node_modules\.bin\tsc.cmd --noEmit -p apps/engine/tsconfig.json
pnpm run lint
.\node_modules\.bin\oxfmt.cmd --check plugins/safe/huhu-plugin.json plugins/safe/src/engine plugins/safe/test
git diff HEAD^ HEAD --check
```

## 接续

原型记录仍为待确认，本轮验收停在真实工作台客户端与 Engine 的能力边界。多账号表单、编辑时的 keep/set/clear、密码显隐与 Renderer 缓存清理、标签操作，以及个人条目的包导出策略由对应切片接续。

## Lead 验收

