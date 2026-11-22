# #9 P1.1 · 当前格式 Safe 主密码与会话生命周期

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t12p`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/report01.md`
- 执行结果 — `done`

## 结论

空白测试 Vault 通过现有 `safe.setup` 一次发布匹配的版本化 keyring 与空清单，重开后可用原主密码解锁。手动、自动、按设置离开、停用和关闭均使旧解锁代失效。切回原 Vault 后启动独立的锁定实例。相同 Safe 同时发起的密钥操作只运行一项，其他请求立即得到忙碌错误。错误主密码仍按当前 Safe 实例累计，五次后冷却 30 秒。损坏显示具体文件，拒绝解锁或初始化并保留原字节。

## 产物与改动

- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/safe-personal`，分支 `impl/huhu-issues-3-10-safe-personal`。本地候选 `6b11b63cb6cfae8b2a2f0effe5d64657a203496f`，直接父 `64788547141e806f5134fff7290b0d44bfa68b5c`，提交后工作树干净。
- 只改 `plugins/safe/src/engine` 和 `plugins/safe/test`。复用 `VaultFiles.write(..., { expectedVersion: null })` 暂存两份文件，写完后在进程内同步检查会话与原状态并同卷重命名目录。首设任一暂存写失败均可重试。暂存位于 Vault 的 `.huhu/cache`，使用现有 ZIP 和 Git 的缓存排除。改密暂存并原子替换 keyring，继续包装同一数据密钥。
- 新文件为 `.huhu/safe/current/keyring.json` 与 `.huhu/safe/current/manifest.json`。两份文件均为 `format: 1`，共用随机 `vaultKeyId`。外层清单初值为 `revision: 0`、`entries: {}`、`tags: null`。其中 `entries` 的形状为条目 ID 到正整数密文版本的映射，`tags` 为可空的正整数密文版本。校验和能在派生前发现结构内的损坏。主密码包装与以数据密钥认证的清单均绑定格式、库身份及用途。未执行旧库迁移。旧 keyring、`safe.items.*`、`secretUse` 继续服务过渡调用者。在合成旧库中验证了解锁保留旧 keyring 字节且不会生成当前格式文件。
- Windows，Node `v24.21.0`，pnpm `12.10.1`。真实 Engine 由测试在回环地址启动，操作仅涉及临时合成 Vault 和合成密码。没有新增 worktree、命令 pane 或远端写入。本地冻结安装生成的包管理器元数据已从根锁恢复，根锁没有进入候选。

## 验证

| 验收要求 | 实际检查与结果 | 实测日志 |
| --- | --- | --- |
| 先重放基线故障 | 修改业务代码前，基线 Safe 共 18 项用例，4 项预期失败。三次并发设密都返回成功。手动及关闭锁定之后，受控 scrypt 的迟到解锁仍成功。只剩残缺清单时，状态误报为空库。使用同一业务工作树的基线源码，Vitest 和 `@huhu/contracts` 从已有只读依赖树解析。 | `red.log` |
| 候选定向回归 | `node .\node_modules\vitest\vitest.mjs run plugins/safe/test`。2 文件、27 项通过，含 24 项 Safe 用例及 3 项真实 Engine 用例。阻塞 scrypt、暂存失败、锁定前后读写、坏文件字节、旧格式兼容、冷却、受控自动锁定、设置及离开、停用、关闭和切回均有断言。真实 Engine 通过桌面令牌访问 `POST /api/v1/call`。 | `green.log` |
| 原 Engine 调用与恢复 | `node .\node_modules\vitest\vitest.mjs run apps/engine/test/engine.test.ts apps/engine/test/module-credential-host.test.ts -t 'safe\|保险箱\|导出\|导入\|backup\|凭据'`。5 项通过，44 项由筛选跳过。覆盖既有 Safe、SSH 凭据引用、诊断标记隔离、ZIP 恢复后用原主密码解锁及 Windows 模块凭据隔离。 | `engine-regression.log` |
| TypeScript | 先执行 `corepack pnpm --filter './vendor/*' run build:types`，再分别执行 `tsc --noEmit -p plugins/safe/tsconfig.json` 和 `tsc --noEmit -p apps/engine/tsconfig.json`，均退出 0。 | `vendor-types.log`、`types.log`、`engine-types.log` |
| Lint 与格式 | 本机锁定 Windows pnpm 执行 `pnpm run lint`。另执行 `oxfmt --check plugins/safe/src/engine plugins/safe/test` 和提交前 `git diff --cached --check`，均通过。lint 的现有脚本产生 Node DEP0190 提示，退出 0。 | `full-lint.log`、`format.log` |

日志在 `C:/Users/cdewta/AppData/Local/Temp/huhu-safe-t12p-6478854/`。基线红灯的复跑配置为同目录 `vitest.red.mjs` 和 `vitest.red.workspace.mjs`。红灯发生在后续夹具扩展前，用当时的测试内容核对 `red.log`。

## 接续契约与验证边界

- P1.2 可使用清单层的条目 ID 与密文版本发布完整条目。新增异步业务写入应捕获同一会话的 `assertCurrent`，在最终发布前同步检查，发布后再通过会话检查返回结果。内容模型、条目/标签密文引用写入与回收归后续切片。
- Renderer 可从 `safe.status` 读取 `{ instanceId: string, generation: number, corruptFile?: "keyring.json" | "manifest.json" }`。状态作用域使用 Vault 和 `instanceId`，同一实例内用 `generation` 丢弃旧读取及旧编辑的结果。现有离开调用仍兼容 `safe.lock({})`，明确的离开路径可调用 `safe.lock({ reason: "leave" })`，由 Engine 判断配置。即时清理渲染缓存时需要共享锁定事件，候选形状为 `safe.locked { instanceId, generation, reason }`，原因可取 `manual | auto | leave | close | corrupt`。
- 本任务观测到 Engine 拒绝迟到的工作。本轮没有运行桌面窗口或原型，Renderer 当前仍依赖既有轮询，清单损坏文案需要接入 `corruptFile`。共享事件声明和 Renderer 接线在 Lead 的写入范围。实际断电或强杀中断在本轮未验证，存储验证覆盖受控写失败及锁定与发布交错。

## Lead 验收


