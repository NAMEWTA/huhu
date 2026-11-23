# #9 P1.2 与 P1.3 · Windows 独立复核

- 任务 [t13x/task01.md](./task01.md)
- 执行结果 **done**。指定的 9 项既有夹具均获得通过结果，其中 3 项首轮超时后定向复跑通过。
- 候选 `aaeed7f8e2008c7379455fe3993a60608b2bb1aa`，直接父提交 `1910acc01334512552bed252e790d864e10950b3`。复跑对象为包含两个切片的候选提交。
- Windows x64（内核版本 `10.0.26300.0`）、Node.js `24.21.0`、Vitest `3.2.7`。使用 Git 归档中的 Engine，经回环地址和既有桌面工作台客户端验证个人条目。Windows 模块凭据使用现有本机保护夹具。

## 实测

| 项目 | 观察结果 |
| --- | --- |
| P1.2 普通保存与重开 | 一次新增三个合成账号。其中两个账号文本相同，三个 `accountId` 各自稳定。重开 Engine 并解锁后，名称、网址、账号字段、长备注、手机号前导零和加号均按原值读回。密码经指定账号显式读取，保留原有空格，空密码返回空字符串。 |
| 回执与敏感数据 | 创建回执精确包含 `entryId`、`revision`、`accountIds`、`status`，状态为 `saved`。账号更新回执由 ID、版本与 `hasPassword` 组成，网址更新回执仅含条目 ID 与版本。详情中的密码状态为 `hasPassword`。合成标记在重开前后经 `vault.search` 查询均无命中。夹具关闭 Engine 后扫描隔离 Vault 的文件字节，未发现所检合成标记或敏感字段。创建和账号更新均未写共享幂等回执，源码中的管理能力也绕过共享输入哈希。 |
| P1.2 校验与写失败 | 空必填、零账号及非法非空网址或邮箱返回 `INVALID_INPUT`。暂存条目、暂存清单及最终发布的受控失败保留原清单字节，失败记录未进入列表。恢复后同一请求只发布一次。 |
| P1.3 局部编辑与清空 | 修改第三个账号的手机、备注与密码后，仅改网址并逐字比较账号集合。验证 `set`、`keep` 和 `clear`，直接提交遮罩字符串被拒绝。两次重开后，其他账号原值一致，清空目标账号的详情返回 `hasPassword: false`，显式读取为空。 |
| 版本冲突与会话失效 | 同一旧版本的两个 caller 修改同一条目时，一方成功，另一方得到 `VERSION_CONFLICT` 与当前版本。不同条目均可更新。同时创建只发布一个清单。重开或锁定使旧会话失效，注入延迟的写入返回 `SAFE_LOCKED`。 |
| 清单与密文引用 | 清单的条目映射为条目 ID 到密文版本，其他字段为格式、库标识、清单版本、标签引用和认证校验。注入编辑失败后重开仍按旧清单读回。夹具模拟已产生密文但清单尚未发布的磁盘状态，未引用版本不可见，重试选择可用版本，同时保留原密文。 |
| 过渡 Safe 与 Windows 模块凭据 | 新个人条目没有出现在 `safe.items.list`，过渡读取同一 ID 得到 `NOT_FOUND`。过渡 Safe 的既有读写与锁定测试通过。Windows 模块夹具在 Safe 锁定时仍可读取由所属模块配置的合成值。ZIP 恢复到不同目录后，模块状态为 `needs-reconfiguration`。 |

## 执行记录

- Windows 自带的 tar 无法提取无关的演示 Vault 文件名和仓库助手链接，随后用 Git 随附的 tar 从同一归档提取测试所需文件。离线安装停在解析锁文件后的阶段，改用本机已安装的依赖。解析比较确认候选应用锁与已安装应用锁一致，98 个工作区依赖链接指向归档源码，294 个第三方依赖链接指向已安装包。归档锁文件的 Git 对象与候选提交一致。
- 首轮 `personal.engine.test.ts` 通过 6 项，新建校验与写失败夹具触及其 30 秒上限。按原上限单独定向复跑，该夹具用时 4.878 秒并通过，其他 6 项由筛选跳过。
- 首轮过渡 Safe 和 Windows 本机凭据夹具均触及默认 5 秒上限。关闭文件并行并将 CLI 超时设为 60 秒后，2 项通过，47 项由筛选跳过。两条定向 Vitest 命令均退出 0。外层清理检查把 Node 编译缓存计为目录而退出 1，回读确认定向复跑仅剩该缓存。
- 首轮超时遗留的合成本机凭据按夹具身份与指纹核对后清除，并确认该测试键已不存在。归档、隔离 Vault、缓存及脚本均已清理，验证窗格退出后已移除。复核期间共享工作区另有更新，本轮业务输入始终固定在归档候选，未创建 worktree，也未写入业务源码和锁文件。候选差异的 `git diff --check` 通过。

```powershell
node node_modules/vitest/vitest.mjs run plugins/safe/test/personal.engine.test.ts --reporter verbose
node node_modules/vitest/vitest.mjs run plugins/safe/test/personal.engine.test.ts -t '校验和两处暂存写失败保留原清单' --reporter=verbose --no-file-parallelism --maxWorkers=1 --hookTimeout=30000
node node_modules/vitest/vitest.mjs run apps/engine/test/engine.test.ts apps/engine/test/module-credential-host.test.ts -t 'safe：ACC-SF-06|Windows 模块凭据与 Safe 锁独立' --reporter=dot --no-file-parallelism --maxWorkers=1 --testTimeout=60000 --hookTimeout=30000
```

复核范围为指定 Engine 夹具，数据全部来自隔离合成 Vault。故障证据来自写入注入与磁盘状态模拟。Renderer 表单与缓存、实际强杀和断电、旧密文版本回收属于本轮范围之外。

依据 [P1.2 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/tasks/P1.2-save-entry.md)、[P1.3 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/tasks/P1.3-edit-account.md)、[个人多账号契约](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/spec.md#personal)、[P1.2 实施报告](../t12p/report02.md)、[P1.3 实施报告](../t12p/report03.md)。

## Lead 验收
