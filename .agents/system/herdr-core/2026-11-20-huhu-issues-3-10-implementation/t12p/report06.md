# #9 P4.2 · Git 认证修复后恢复

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t12p`
- task — `task06.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/task06.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t12p/report06.md`
- 执行结果 — `done`

## 交付

候选 `bb6f450b96dfb9259713714041c55c1e15dcacd3`，直接父提交 `f5a92e68df2ba655e9c888ddb9e61460cd69a4aa`，分支 `impl/huhu-issues-3-10-versioning-auth`，提交后工作树干净。 [提交核对](./evidence-task06/commit.log)

`sync.status` 在认证暂停时返回目标、认证修订、来源和脱敏原因。桌面 `sync.auth.configure` 保存匹配目标的新修订后排队一次恢复。操作进入现有串行 Git 队列后再次检查目标、修订、配置模式、冲突与只读状态。原 `follow` 模式执行拉取，`full` 模式执行完整同步。旧修订、别的仓库或单独保留凭据均不会安排恢复。Safe 解锁事件只用于匹配旧引用且实际因 Safe 锁定暂停的过渡配置。只读 Vault 在发起 Git 请求前返回 `READ_ONLY_VAULT`。

## 可复核结果

环境为 Windows x64、系统 Git 2.47.1.windows.2、Node 24.21.0。测试从实际桌面 Engine 能力入口使用合成凭据，远端只监听 `127.0.0.1`。

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 基线复现 | 保存有效凭据后仍为 `auth-failed`，回归用例失败。 | [红灯输出](./evidence-task06/red.log) |
| HTTPS 拒绝并修复 | 首次 401 共 2 个请求。连续两轮 Safe 锁定／解锁增加 0 个请求。Safe 锁定时修复当前凭据后只运行一次完整同步，共 7 个请求。拉取阶段 4 个，推送阶段 3 个。核对两侧文件及原配置，状态回到 `idle`。过期写入返回 `VERSION_CONFLICT`，增加 0 个请求。 | [回环请求记录](./evidence-task06/https-requests.log)、[完整测试](./evidence-task06/versioning-tests.log) |
| HTTP 换仓库及再次拒绝 | `a.git` 首次拒绝共 2 个请求。选择并保存 `b.git` 凭据增加 0 个请求。`b.git` 显式拉取被拒后，保留凭据增加 0 个请求。替换成仍无效的凭据仅重试一次，共 2 个请求，随后返回新修订及 `remote-rejected`。只读 Engine 返回 `READ_ONLY_VAULT`，增加 0 个请求，Git 配置字节一致。 | [完整测试](./evidence-task06/versioning-tests.log) |
| 调度与回归 | 覆盖迟到失败、旧定时器、多次保存只保留最新修订、执行前的关闭／只读／冲突检查和旧引用过渡路径。Versioning 7 个文件，74 项通过、1 项按 Windows 基线跳过。Engine 原生凭据宿主回归 1 项通过。 | [完整测试](./evidence-task06/versioning-tests.log)、[Engine 回归](./evidence-task06/engine-regression.log) |
| 静态检查 | Versioning 与 Engine TypeScript、Versioning lint、格式和 Git 差异检查通过。全仓 lint 在父提交已有的 Agent CLI `dispatch-store.ts:42` 的 `no-control-regex` 处退出，文件 blob 与父提交相同。 | [Versioning 类型](./evidence-task06/versioning-types.log)、[Engine 类型](./evidence-task06/engine-types.log)、[范围 lint](./evidence-task06/versioning-lint.log)、[格式](./evidence-task06/format.log)、[差异](./evidence-task06/diff-check.log)、[全仓 lint](./evidence-task06/root-lint.log)、[基线核对](./evidence-task06/environment.log) |

测试清除合成的模块凭据，关闭 Engine 和回环服务，并断言隔离目录已删除。本轮沿用既有工作树与锁文件，仅使用本地回环测试和临时数据，未创建临时验证窗格。P4.2 验收记录已回填，前端原型待确认。
