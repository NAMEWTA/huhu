# task14.md · #7 H11.1 外部 SSH 资源与信任垂直切片

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task14.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task14.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report14.md
- 执行结果 — done
- 交付范围 — H11.1 主机／路由、主体绑定的信任待答，以及 H11.3 的已交付资源入口对照
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — `impl/huhu-issues-3-10-ssh-public-resources`
- 基线 — `295c052b3b46100808c086f83e78ac894d140f5c`
- HEAD — `be7a8b8e2252149b8ab7330d17e9defc8319d6ad`

## 提交

| 提交 | 已验证行为 |
| --- | --- |
| `621219a3618b5f8104d15d6fafa49bea80fc1afc` | 静态能力 `ssh.resources.host.get`。按已知主机 ID 读取最小主机和逐跳路线摘要。读取绕过会检查本机凭据的主机列表。 |
| `24276472648268cf13edd4f71fa94f9269f1025f` | `ssh.resources.connection.start/get/list` 和 `ssh.resources.trust.decide`。独立核验连接按主体、目标、路由修订、跳点、提示及指纹复核。实际认证沿用 SSH 租约和指纹核实。 |
| `e85f37251c0b1cd00c81df4ffdeaa9cfde2f01b8` | 在实际 Workbench、CLI 二进制及 MCP stdio／HTTP 比对同一主机资源和撤权。 |
| `caa742c8af5ab5b1dbb86142f0ff714174b0d552` | Windows 隔离用例通过 SSH 领域接口回收新建的受保护测试凭据。 |
| `be7a8b8e2252149b8ab7330d17e9defc8319d6ad` | 持久验收记录。 |

## 权限与行为

- 五项描述按真实 `read` 或 `execute` 分类，核验及信任决定位于 high 风险，默认外部关闭。只读调用通过可移植配置或内存状态完成。投影没有用户名、凭据值、封套引用或本机凭据状态。测试断言 `ModuleCredentials.list/use` 零次、两台回环 SSH 零拨号。
- 核验复用现有 `dialChain`，记录归当前 Engine、Vault 和经认证的 caller/subject，采用原记录和凭据读取租约内的修订复核。单独打开的核验连接完成后回收。同主体同路由的在途重复启动拿到原尝试，核验结果不能借作工作台、Exec 或 SFTP 的活动连接。
- 首次可信答复只适用于原连接，输入包含主机／尝试 ID、路由修订、跳点／实际跳板 ID、指纹和提示修订。已消费提示、错主体、错目标和错跳点均拒绝。变更指纹保持专用已知主机核实流程。工具撤权后实测 `CAPABILITY_NOT_EXPOSED`，HTTP token 撤销后实测 401。两个 MCP 传输各自沿用 Gateway 的真实认证主体；不同身份之间不交换待答或回执。
- 跳板修订在第二跳待答期间被修改，旧决定实得 `VERSION_CONFLICT`，目标回环服务没有收到密码。Safe 停用时仍使用 SSH 自有的合成认证。

## Windows 验证

最终桌面生产构建标记 `caa742c8`。SSH Settings 与 Trust Playwright 5 项通过，覆盖真实 CLI 入口、MCP stdio／Streamable HTTP、桌面首次指纹及回环 Web 指纹核对。SSH 模块 13 个测试文件、78 项通过，其中 4 项直接覆盖 H11.1。SSH TypeScript、范围内格式和 lint、`git diff --check 295c052b..HEAD` 均通过。工作树干净，10 个任务临时依赖 junction 已回收。 [构建日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task14/delivered-build.log>) · [最终 Workbench](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task14/delivered-workbench.log>) · [最终 SSH 测试](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task14/delivered-ssh-tests.log>) · [仓内证据](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H11.1-public-resources-windows.md>)

初次组合中既有用例及新用例在生成测试主机凭据时受 Windows 错误 8 影响，受控合成写入复现同一错误。按本终端日志和磁盘指纹复核后回收已退出 Workbench 工作进程持有的 23 条测试凭据，确认原生写入和读回恢复；复跑结束额外回收同一轮 Workbench 的 4 条旧用例夹具凭据。 [初次日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task14/initial-ssh-tests-windows-error8.log>) · [受控回收](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task14/owned-test-key-cleanup.log>) · [复跑夹具回收](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task14/rerun-workbench-key-cleanup.log>)

## 装配与剩余接口

- **Lead 注册**。现有 Engine 的 `declareDescriptors("ssh", Object.values(ssh.sshCapabilityDescriptors))` 已收录新描述，激活沿用现有 SSH 插件 handler。通用 CLI 和两种 MCP 工具传输均走当前 Dispatcher。若后续需要 SSH 原生 `resources/list`、URI 模板或流授权，由 Lead 在共享 Gateway 注册，再复用本切片的主体和对象核验。管理目录、公共装配和根锁范围此次由各自所有者继续管理。
- **H11.2**。已有核验资源只表示一次邻接 SSH 认证结果。外部已授权持久连接、Exec 作业、UTF-8 字节游标与取消尚未开放。后续需要在同一主体和 Vault 下为可用连接建立显式持有者，并为每个读写与取消动作提供当前策略校验。通用工作台运行或传输对象不能直接借用本次核验的回执。
- **H11.3 和 G5c.1**。主机读取验证覆盖 Workbench、Engine、实际 CLI 进程、MCP stdio 与 MCP Streamable HTTP。认证核验由 Engine、CLI 和 MCP HTTP 实测，跨入口配置写入、Shell/Exec、SFTP 及传输取消留待各专项授权和端到端验收。库内主机枚举如需对外提供，应从共享可移植定义层扩展字段投影，避免读取封套。Q6-3 的逐主机选择仍依照 #6 的产品决定。

## Lead 验收
