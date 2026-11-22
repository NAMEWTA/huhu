# H7 单文件传输与 W8.1 组合复核

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task12.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task12.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report12.md`
- 固定候选 — `ed17bce6ba6f75568e0a9b3920283b1395344686`
- 执行结果 — `done`

## 结论

H7 在真实 Windows 回环 SFTP 中确认两个 **P2**。第二次暂停可被最终提交越过，已确认暂停的任务仍替换目标。发布成功但回包丢失时，任务显示失败，重试转为版本冲突。已有目标的旧字节保存在备份中。W8.1 在固定组合上用真实 Core 独立通过 21 项测试。恢复库只读布局时不启动 Core，外部目录待绑定，原库可读回原布局。 [H7 复验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/h7-probes-final.log) · [W8.1 独立运行](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/space-restore-independently.log)

## 产物与改动

在系统临时目录解出固定组合源码并复用已装依赖。H7 附加探针复用 ssh2 回环夹具，以测试专用延时或只关闭 SFTP 通道制造时序，实际使用候选的 `SshManager`、`FileSessions`、`Transfers`。业务源码、其他 worktree、集成构建目录、根锁及真实远端未写入。目录批量传输和 report11 两项按任务分工另行处理。 [独立探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/test/t187-h7-review.test.ts) · [回环夹具](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/test/t187-sftp-fixture.ts)

## 验证

### H7 单文件传输

| 范围 | 实际观察 | 证据 |
| --- | --- | --- |
| 有界队列与任务归属 | 独立探针接纳 32 个未终结任务，第 33 个被拒，取消释放名额，清历史后实物未变。调度器上限为 2，以原连接 ID 和本机路径避免同资源同时执行。存活任务保存在本 Engine 生命周期内。 | [队列与调度](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/transfers.ts:12) · [独立复验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/h7-probes-final.log) |
| 暂存与覆盖保全 | Windows 本机上传等待确认时改写远端目标，旧请求因版本冲突失败，改写后的字节仍在。重新发起并确认覆盖后回读得到本机源字节，目录无残留暂存。候选 App 用例还核对了拒绝覆盖、本机下载覆盖、暂存写阶段取消及确定未提交时恢复旧目标再重试。完整 App 场景沿用实现者 Windows 证据。 | [前后快照及独占暂存](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/transfers.ts:222) · [实际 App 用例](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/tests/e2e/workflows/ssh-workspaces.spec.ts:531) · [实现者取证](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H7-transfer-windows.md) |
| 跨端点前缀续传 | 两个实际回环 SSH 连接用同一任务按已有目标前缀续传，提交后的字节、源权限 `0640` 和时间戳均一致，清理无残留。固定 App 证据另覆盖前缀不匹配、写入阶段暂停再继续。两项新提交边界缺陷见下文。 | [前缀验证](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/transfers.ts:236) · [双端 App 用例](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/tests/e2e/workflows/ssh-workspaces.spec.ts:636) · [双端独立运行](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/h7-probes-final.log) |
| 原文件会话与失联 | Windows 上传返回原任务的远端文件会话及路径。同主机重连产生新连接 ID，旧任务打开来源仍得到原 fileSessionId、原连接 ID 和「已断开」。远端下载用例另断言原文件行恢复定位。重试检查两端原连接身份，已断开时要求从新文件会话发起。 | [查回来源和重试约束](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/transfers.ts:103) · [恢复旧会话](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/file-sessions.ts:40) · [下载定位断言](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/tests/e2e/workflows/ssh-workspaces.spec.ts:608) · [独立复验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/h7-probes-final.log) |

### P2 · 最终目标复查期间再次暂停，任务仍提交覆盖

在两个回环端点上发起覆盖。首次暂停在暂存通过后、提交前生效。继续后，目标进入重新指纹核对。在这次读取期间再次暂停，接口回执为 `paused`，目标仍是旧字节。释放 SFTP 读取后，未发送第二次继续，请求仍进入 `completed`，目标变为新字节。提交分支只在进入复查前检查一次暂停，复查返回后直接进入 `committing`。 [暂停和发布边界](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/transfers.ts:291) · [独立探针与结果](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/test/t187-h7-review.test.ts) · [回环日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/h7-probes-final.log)

### P2 · 发布回包丢失后，已提交任务显示失败且重试丢失备份位置

两个回环端点的覆盖到达最后一次重命名。目标服务已提交新文件，随后只结束 SFTP 通道，原 SSH 连接仍在线。回读目标得到完整新字节，旧字节保存于 `.old`，任务却报 `failed`。恢复分支看到目标存在即保留备份，未核对目标是否就是本次暂存的校验结果。重试对比旧目标快照后报 `VERSION_CONFLICT`，没有二次发布，但任务消息丢失了原先显示的备份位置。 [发布后错误处理](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/transfers.ts:310) · [备份恢复判断](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/transfers.ts:326) · [重试清除消息](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/transfers.ts:103) · [回环日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/h7-probes-final.log)

实现会在发布前以摘要和元数据核对目标，并为覆盖保留旧件。当原 SSH 连接整体消失时，当前代码只能提示在原设备检查备份。端点无法回读时的实际结果仍需对账，本轮两个 P2 来自可回读的具体结果。 [错误回收路径](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/ssh/src/engine/transfers.ts:310) · [H7.2 验收合同](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H7.2-transfer-conflicts.md)

### W8.1 已集成行为

- 独立运行组合内的 `agent-workspace.test.ts`、`spaces-package.test.ts` 和 Vault 包测试，21 项全部通过，与 Lead 的定向日志相符。恢复库中从实际 Engine 能力查 Core 得到 `idle`，Vault 根和待绑定外部 Space 读回版本 0 的空布局。对未绑定 Space 发起新启动收到 `SPACE_INVALID`，目的地未创建 Core 运行目录。此分支先 peek，确有原机保存布局时仍沿原库回读路径。 [独立 Windows 日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/space-restore-independently.log) · [Lead 日志](D:/Document/code/huhu/temp/issue-baseline/space-restore-core.log:11) · [实际 Engine 断言](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/apps/engine/test/agent-workspace.test.ts:50) · [Core 读取条件](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/plugins/agent-cli/src/engine/herdr-core.ts:111)
- ZIP 进出共用本机状态筛选。导入在校验清单和摘要后再排除 `.huhu/runtime`、缓存、UI、历史及 Agent 会话／启动请求。只恢复目录业务数据。库根和保留的库内相对目录在目的地重新解析，外部绑定显示待绑定。桌面能力在导入当前源 Vault 的包时重生成冲突的 Vault ID，避免借用源 Core 名称。重新打开源库读回原布局版本及原外部路径，源布局与启动回执留在源库。 [筛选规则](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/packages/vault/src/package/package.ts:27) · [导入落盘](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/packages/vault/src/package/package.ts:168) · [桌面导入能力](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/packages/kernel/src/capabilities/package.ts:93) · [组合测试](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/candidate/apps/engine/test/agent-workspace.test.ts:31)

### 环境和验证范围

Windows x64 `10.0.26300`、Node `24.21.0`、Vitest `3.2.7`、ssh2 `1.17.0`。组合恢复使用固定 Herdr Core `0.1.19`，SHA-256 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。SSH 两个提交的差异检查通过。SSH 回归在默认依赖解析下 62 项通过，其中 58 项仓库用例及 4 项独立探针。初跑保留符号链接路径导致 Windows Keyring 原生模块无法加载，改用默认解析后单独复跑及完整 SSH 回归均通过。独立 H7 探针中两项验证预期行为，两项断言稳定触发现有缺陷。 [SSH 回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/ssh-suite-final.log) · [临时依赖诊断](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/keyring-binding.log) · [H7 复验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/h7-probes-final.log) · [Core 指纹与结果](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task12-6bf195d8/space-restore-independently.log)

## 阻碍与接续

固定组合复核已完成。两项 P2 可用附加回环探针复验。W8.1 在本次集成范围内无确认阻碍。独立 H7 覆盖停在实际 Engine 组件和协议运行，App 层以候选用例及实现者取证为准。

## Lead 验收
