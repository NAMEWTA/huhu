# #6 G1.2 目录返工与 G2.1 默认关闭独立复验

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — `t4x`
- task — `task01.md`
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report01.md
- 执行结果 — `done`
- 身份 — Windows Core `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`，版本 `0.1.21`。发布时核对 `HC_TERMINAL_ID=t4x` 和 `t4x / task01.md / active`。

## 签收建议

**G2.1 在本次范围内可签收。G1.2 原审查两项均已修复，返工候选建议暂缓签收。** 新发现一项 P2，扩展启动失败后安装回滚保留了该次登记的名称占位。同一 Engine 随后的独立安装会收到 `NAME_CONFLICT`，父提交接受同一操作。 [G1.2 验收](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G1.2-inactive-catalog.md) · [G2.1 验收](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G2.1-vault-policy.md) · [原审查](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report04.md)

## 规格轴

- **原 P2 已修复。** 在同一 Engine 上，经桌面 HTTP 管理入口安装、停用、卸载和复装只声明能力的合成扩展。安装前及卸载后目录移除该项，`gateway.check` 为 `found:false / not-found`，CLI 和两种 MCP 对旧名均返回 `CAPABILITY_NOT_FOUND`。安装及原扩展复装后目录显示归属和 `handler-missing`，调用错误带该原因。仍安装但停用时保留目录项，调用为 `PLUGIN_DISABLED`。成功卸载后，同一 Engine 拒绝由其他扩展登记同一 canonical ID 或会投影成同一 MCP 名的 ID。 [同 Engine 回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/apps/cli/test/cli.test.ts:96) · [定向日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/logs/targeted.log)
- **G2.1 通过。** 使用实际 Engine、构建产出的 CLI、真实 stdio 子进程、HTTP MCP 和命名 HTTP 令牌。空 Vault 的外部发现为空，调用返回 `CAPABILITY_NOT_EXPOSED`。单独开启 `notes.read` 后，revision 为 1，各入口只发现该项并读到同一合成正文。停用 Notes 时保留选择及 Schema，外部发现移除该项，缓存名称返回 `PLUGIN_DISABLED`，再启用恢复。重开 Vault A 后只恢复已选项，Vault B 仍为 revision 0 且零开放。关闭该项后各入口停止发现并拒绝旧名。坏格式样例含一项 true，重开后管理端报告 `invalid-format`，外部发现为空且调用失败，原文件逐字节保留，桌面端可继续读取。冻结候选自带用例还验证新工具先为 `selected:null`、显式关闭后为 false、同值重试保持 revision，旧格式偏好不带入授权。 [独立探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/apps/cli/review/t4x-review.test.ts) · [双 Vault 回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/apps/engine/test/tool-access.test.ts) · [运行日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/logs/probes-and-engine.log)
- **公共授权回归通过。** 外部入口使用带认证的 `GET /api/v1/capabilities`，管理目录和策略查询受桌面身份约束。CLI、REST 和两种 MCP 的工具发现与调用使用同一 Dispatcher 策略。Engine 定向回归同时覆盖命名令牌撤销、第三方委托权限、保险箱限制、自动化规则限制及主页摘要的调用者身份。只授权笔记列表时摘要正文为空，额外授权 `notes.read` 后才出现。 [HTTP 接线](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/packages/kernel/src/server/http-app.ts:93) · [Dispatcher](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/packages/kernel/src/dispatcher.ts:125) · [运行日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/logs/probes-and-engine.log)

## 规范轴

- **P2 · 启动失败的安装回滚留下能力名称占位。** 两份冻结快照均通过正常的 `plugins.install` 启动同一个合成扩展，它在激活时抛出测试错误。两边均返回 `INVALID_INPUT`，移除安装目录、安装记录和本机信任记录，保留预先存在的数据。管理目录和 `gateway.check` 均显示该能力不存在。随后在同一 Engine 尝试安装另一份声明同一测试 ID 的合成扩展，父提交接受，冻结候选返回 `NAME_CONFLICT`。候选仍允许原扩展修正后重试。原因是注册时立即为清单声明写入 `toolOwners`，安装回滚通过 `unregister` 清理目录和 handler 时沿用了成功卸载的保留语义。建议在启动成功后确认历史归属，回滚时释放本次失败安装新增的占位，保留成功安装后卸载的旧名保护。 [名称占位](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/packages/kernel/src/capabilities/define.ts:104) · [安装与回滚](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/packages/kernel/src/plugins/external.ts:293) · [候选日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/logs/probes-and-engine.log) · [父提交对照](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/logs/parent-rollback.log)
- **原 P3 已修复。** 普通描述对象先登记和先绑定两种顺序均通过。首次使用冻结描述字段，目录与绑定共享同一份输入和输出 Schema，之后替换源对象字段不改变两者。复制绑定对象或提交异源绑定均被拒绝。Notes 读项和 SSH 的 21 项描述在停用场景保持完整，SSH 重开后保留停用，重新启用后桌面调用恢复。 [描述快照](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/packages/kernel/src/capabilities/define.ts:44) · [静态目录测试](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/packages/kernel/test/capability-catalog.test.ts) · [Engine 目录测试](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/apps/engine/test/capability-catalog.test.ts)
- **并发停用与卸载回归通过。** 用异步释放夹具暂停停用，发起卸载与重复卸载。卸载等待正在运行的停用，期间启用回报 `disabled`。释放后运行时、目录及 handler 同步清除，复装可绑定新 handler。 [PluginManager 回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/candidate/packages/kernel/test/plugin-manager.test.ts:201)

## 冻结范围与证据

- 候选 `cc736e5fbdead615b4d49fa147969f8f86ea4076`，树 `181194bfe007ab689c0bafd380d9b0d1a8e2e9de`。直接父提交 `29a6e8f13bcbd3e644ef9b7a2a463627e6d39735`，G1.2 `6e6240d5573dcf0c825680a7d0dfcb6ccf971a4e` 为其父提交。从 G1.1 `2dfd76240dbf8edc87310820b427452406d52635` 审查三次差异，共 26 个文件，其中 4 个新增。运行副本的 26 个文件逐一与候选 Git blob 核对。对照了两份实现报告。 [G2.1 实现报告](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report03.md) · [返工报告](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report04.md)
- Windows 11 build 26300，Node 24.21.0、Vitest 3.2.7、TypeScript 5.9.3。用 `git archive` 提取到系统临时目录，workspace 依赖指向对应 SHA 的副本，第三方依赖来自 Windows 集成检出。根锁文件 Git blob `e7c2876017054b1a8944cf954b2cec97981bfdc0` 一致。Vault、扩展、令牌及数据均为系统临时目录内夹具，HTTP 只访问回环。原检出仅作读取，共享根仅发布本报告。
- 三个 vendor 类型声明构建通过，CLI `node scripts/build.mjs` 退出 0，构建产物 `--version` 为 `0.0.1-rc.4`，SHA-256 为 `a0fa32c99e3750227cd6df5bbdaecc46c9f024d7c45bf8a430016f1090e74967`。Contracts、Kernel、Engine、CLI 类型检查通过，26 个候选文件的 oxfmt、oxlint 和 Git 差异检查通过。两份 Playwright 夹具可枚举。 [CLI 构建及定向测试脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/run-review.ps1) · [类型及夹具日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/logs/types-and-list.log)
- 冻结候选定向回归 12 文件、96 项通过，Engine 公共授权 11 项通过，独立探针 2 项完成并记录上述新回归。父提交运行同一回滚探针，确认结果差异。 [定向日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/logs/targeted.log) · [候选探针脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/run-probes.ps1) · [父提交探针脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/run-parent.ps1)

## 接续范围

建议先修复安装失败留下的名称占位，再以本报告的父提交对照和同 Engine 生命周期用例复验。Electron GUI、完整桌面安装包、真实 SSH 主机、按筛选跳过的 34 项 Engine 用例及后续 G2.2、G2.3、G3 和 G4 验收留待对应阶段。

## Lead 验收

由 Lead 追加。
