# #6 失败安装的能力名称回滚

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — `t5r`
- task — `task01.md`
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t5r/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t5r/report01.md
- 执行结果 — `done`
- 身份 — Windows Core `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`，版本 `0.1.21`。发布时核对 `HC_TERMINAL_ID=t5r` 和清单指针 `t5r / task01.md / active`。

## 结论

通过正常 `plugins.install` 触发激活失败后，同一 Engine 可以让另一扩展安装该次新增的能力名。成功安装确认过的 canonical ID 和 MCP 投影归属会在同一 Engine 内保留。失败复装只释放该次新增的占位。作用域释放尚未完成时，其他插件对两个名称的竞争登记都返回 `NAME_CONFLICT`。

## 产物与改动

- 工作目录 `D:/Document/code/huhu/temp/issue-worktrees/capability`，分支 `impl/huhu-issues-3-10-capability`。追加本地候选 `c70a98729fd2c72dca819f3ca1888e5a2e45949e`，树 `8d5453cd08fc746afe09581286a07aeb9609d9ff`，直接父提交 `cc736e5fbdead615b4d49fa147969f8f86ea4076`。三个冻结提交仍在原祖先链，工作树干净。
- Registry 继续原子检查 canonical ID 和 MCP 投影，按新安装记录此次首次取得的名称。PluginManager 在新扩展激活成功时确认占位。失败后沿现有安装回滚注销，等待停用和作用域释放，再移除对应目录项、活动注册和临时占位。应用启动时加载已有扩展沿用已安装登记。 [Registry](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/capabilities/define.ts:106) · [PluginManager](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/plugin-manager.ts:41) · [安装入口](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/plugins/external.ts:293) · [Engine 接线](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/src/boot.ts:144)
- 六个改动文件的测试副本逐一与候选 Git blob 核对。根锁文件 blob 为 `e7c2876017054b1a8944cf954b2cec97981bfdc0`。 [快照校验](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/snapshot-blobs.log)

## 验证

| 验收项 | 实际结果 | 证据 |
| --- | --- | --- |
| 基线红灯 | 在 `cc736e5` 上，仅新增回归用例即复现。首个安装返回 `INVALID_INPUT`，安装目录、安装记录、信任记录及能力目录项均已清除，预存数据保留。第二个扩展在同一 Engine 安装得到 `ok:false`，Vitest 退出 1。t4x 的独立基线探针记录了第二次安装的错误码 `NAME_CONFLICT`。 | [本次红灯](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/red.log) · [t4x 错误码](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-070b2ed00fe7/logs/probes-and-engine.log) |
| 候选绿灯 | 同一用例通过，第二个扩展安装成功并成为目录归属。失败复装用例确认之前成功安装的 canonical ID 及 MCP 投影仍拒绝竞争登记，另一个扩展可登记本次新增名称，原扩展可继续复装。 | [Engine 安装回归](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/external-plugins.test.ts:173) · [绿灯日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/green.log) |
| 并发和生命周期 | 暂停失败安装的作用域释放，另一个插件的 canonical ID 及 MCP 投影均冲突。释放并注销后第二个插件可登记。原有同 Engine 的安装、停用、卸载、同插件复装在目录、CLI 和两种 MCP 上通过，其他插件在卸载后仍受到历史归属约束。 | [并发用例](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/test/plugin-manager.test.ts:246) · [CLI 生命周期](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/cli/test/cli.test.ts:84) |
| G2.1 两个 Vault 和坏策略 | 默认零开放，Vault A 仅选择 `notes.read` 后重开仍为 revision 1，Vault B 为 revision 0 且零开放。坏策略含有一项 true，重开报告 `invalid-format`，外部发现与调用均失败关闭，坏文件逐字节保留，桌面可继续读取。常规回归也覆盖新能力未配置、显式关闭、重复写值和旧偏好读入。 | [双 Vault 用例](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/tool-access.test.ts) · [构建产物探针日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/packaged-policy.log) |
| HTTP、CLI、MCP 共用判断 | 命名 HTTP 令牌、构建后的 CLI 进程、stdio MCP 子进程和 HTTP MCP 对单项开放、插件停启、撤回曝光及坏策略给出一致的发现与调用结果。CLI 版本为 `0.0.1-rc.4`，产物 SHA-256 为 `a0fa32c99e3750227cd6df5bbdaecc46c9f024d7c45bf8a430016f1090e74967`。 | [CLI 构建](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/cli-build.log) · [四入口探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/packaged-policy.fixture.ts) |
| 汇总 | 定向回归 12 文件、99 项全通过。Engine 授权专项 11 项、构建产物探针 1 项通过。cosmokit、cordis、timer 类型声明构建通过，Contracts、Kernel、Engine、CLI 类型检查通过。六文件通过 oxfmt、oxlint 和 Git 差异检查。 | [定向回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/green.log) · [授权专项](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/engine-auth.log) · [类型检查](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/types.log) |

## 环境与重放

Windows 11 Pro build 26300、Node 24.21.0、Vitest 3.2.7。Vault、凭据和扩展均为测试夹具，调用限本机回环。锁定版 Windows pnpm 12.10.1 的 frozen install 停在依赖链接阶段，终止后恢复了该工具自动写入的根锁差异。本次验证复用同锁的 Windows integration 第三方依赖，workspace 链接分别指向 capability 工作树和候选测试副本。测试副本来自 `git archive`，是普通临时目录。 [快照脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/prepare-snapshot.ps1) · [验证脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20/verify.ps1)

在 capability 工作树根执行以下命令。基线快照脚本只将当前提交里的外部扩展测试文件拷入基线副本，红灯筛选只运行目标用例。各阶段自行配置临时 Vault 根和 Git 发现上限。

```powershell
$proof = 'C:/Users/cdewta/AppData/Local/Temp/huhu-t5r-2026-11-20'
powershell.exe -NoProfile -File "$proof/prepare-snapshot.ps1" cc736e5fbdead615b4d49fa147969f8f86ea4076 baseline
Push-Location "$proof/baseline"
powershell.exe -NoProfile -File "$proof/verify.ps1" red
Pop-Location
Push-Location "$proof/candidate-verified"
powershell.exe -NoProfile -File "$proof/verify.ps1" green
powershell.exe -NoProfile -File "$proof/verify.ps1" engine-auth
powershell.exe -NoProfile -File "$proof/verify.ps1" packaged-policy
Pop-Location
powershell.exe -NoProfile -File "$proof/verify.ps1" types
git diff HEAD^ HEAD --check
```

## 阻碍与接续

本任务无阻碍。验证范围之外包括 Electron GUI、完整桌面安装包、真实 SSH 主机、Engine 授权筛选未运行的 34 项，以及磁盘 I/O 故障注入。候选保留在本地供 Lead 验收。

## Lead 验收

由 Lead 追加。

Lead 核对了冻结提交、父提交和自测记录，返工实现收件完成。交 `t4x/task02.md` 独立复核，链的合入按复核结论。
