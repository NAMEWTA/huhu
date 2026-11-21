# #9 P1.3 · 编辑个人条目与单个账号

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t12p`
- task — `task03.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/task03.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/report03.md`
- 执行结果 — `done`

## 结论

真实桌面工作台客户端可以单独修改条目名称、网址，或按 `entryId + accountId` 修改一个账号。账号密码使用显式 `keep`、`set`、`clear` 动作。验证覆盖带前后空格的密码、清空后重开、其他账号逐字保护，以及单改网址后账号资料保持一致。相同条目的并发编辑以该条目的版本判定冲突，不同条目各自可提交。

## 候选与改动

- 本地候选 `aaeed7f8e2008c7379455fe3993a60608b2bb1aa`，直接父 `1910acc01334512552bed252e790d864e10950b3`，分支 `impl/huhu-issues-3-10-safe-personal`。使用既有 Windows worktree 与依赖。6 个改动文件位于 Safe 清单、Engine 和测试。检出提交后干净。
- 复用 P1.2 的 `VaultFiles.write`、密文校验、置入版本文件及原子替换清单。写队列在提交前重新校验解锁代和相应预期版本。一次已完成的发布只改变目标条目引用，同时递增清单代。读者通过清单找到完整密文。未提交密文占用下一版本时，重试选择后续可用版本，保留已有密文及最后一版有效清单。版本号应作为不透明比较值使用。
- 新能力接入既有桌面工作台注册，继续使用实例及解锁代验证、桌面管理能力和版本防重放。审计仅记动作、ID、结果等元数据。过渡 `safe.items.*`、`secretUse` 及 Windows 本机模块凭据路径均沿用。
- 工作范围为 P1.3 Engine。Renderer 和原型待确认，个人条目旧加密版本的回收由对应存储切片接续。写入中断由受控失败和重建两次重命名之间的磁盘状态验证，未执行真实强杀或断电。

## 调用契约

- `safe.entries.update` 接收 `session`、`entryId`、条目 `expectedRevision`，以及至少一个要修改的 `name` 或 `url`。空字符串可清空网址。回执为 `{ entryId, revision }`。
- `safe.accounts.update` 接收 `session`、`entryId`、`accountId`、条目 `expectedRevision`，可选 `account`、`phone`、`email`、`note`。必填 `password` 采用 `{ kind: "keep" }`、`{ kind: "set", value }` 或 `{ kind: "clear" }`。直接提供显示遮罩字符串或给 set 提供空值均被拒绝。回执为 `{ entryId, accountId, revision, hasPassword }`。
- 修改使用 `safe.entries.get` 返回的条目版本。旧版本得到 `VERSION_CONFLICT` 和字符串 `details.currentVersion`，可重读后提交。旧实例、锁定或已失效的解锁代得到 `SAFE_LOCKED`。

## Windows 验证

| 验证 | 观察 | 日志 |
| --- | --- | --- |
| 父提交红灯 | 3 项新测试均收到 `CAPABILITY_NOT_FOUND`，既有 4 项通过。 | [red.log](./evidence-task03/red.log) |
| 候选绿灯 | Safe 3 个文件共 34 项，通过 3 个新增的真实工作台 HTTP/Engine 用例。验证账号隔离，公共网址修改，密码动作及两次重开，并发版本冲突，写失败，锁定后拒绝迟到写入，读取旧版及保留孤儿密文后重试。 | [green.log](./evidence-task03/green.log) |
| 敏感字段 | 实际清单、审计、共享回执和 Vault 其余普通文件按标记扫描。未发现新增合成明文。 | [green.log](./evidence-task03/green.log) |
| 过渡接口 | 5 项既有 Engine 定向测试通过，44 项由筛选跳过。包含旧 Safe、SSH 引用、诊断、ZIP 与 Windows 模块凭据隔离。 | [engine-regression.log](./evidence-task03/engine-regression.log) |
| 静态检查 | Safe 和 Engine TypeScript、Safe lint、格式和 Git 差异检查通过。根 lint 通过，输出既有 Node DEP0190 提示。 | [Safe TS](./evidence-task03/types.log)、[Engine TS](./evidence-task03/engine-types.log)、[Safe lint](./evidence-task03/safe-lint.log)、[根 lint](./evidence-task03/lint.log)、[格式](./evidence-task03/format.log) |

复跑命令，在指定工作树执行。

```powershell
node .\node_modules\vitest\vitest.mjs run plugins/safe/test/personal.engine.test.ts
node .\node_modules\vitest\vitest.mjs run plugins/safe/test
node .\node_modules\vitest\vitest.mjs run apps/engine/test/engine.test.ts apps/engine/test/module-credential-host.test.ts -t 'safe|保险箱|导出|导入|backup|凭据'
.\node_modules\.bin\tsc.cmd --noEmit -p plugins/safe/tsconfig.json
.\node_modules\.bin\tsc.cmd --noEmit -p apps/engine/tsconfig.json
.\node_modules\.bin\oxlint.cmd -c oxlint.json plugins/safe/src/engine plugins/safe/test
.\node_modules\.bin\oxfmt.cmd --check plugins/safe/huhu-plugin.json plugins/safe/src/engine plugins/safe/test
git diff HEAD^ HEAD --check
```

临时 Engine 使用合成 Vault 与回环地址，由测试关闭并清理目录。未新开 worktree 或命令 pane。

## Lead 验收

