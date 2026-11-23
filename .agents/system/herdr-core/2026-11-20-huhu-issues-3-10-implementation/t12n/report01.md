# #10 W02-05 私有看板恢复 Windows 用例记录

- 终端 `t12n`。交付范围按最新指示收窄为已完成的原有用例结果、候选出处与待验范围。新增验证已停止，本报告引用实施终端 `t122` 的运行日志。
- 冻结候选 `95ecb232575813a0f8ccf665e79eec78dd03869d`，父提交 `2ceec67d9be1227da4815dc1df1afd8f1d8069c3`。本地 Git 已核实提交与父关系。来源为 `impl/huhu-issues-3-10-dashboard-restore`，原检出为 `temp/issue-worktrees/dashboard-restore`。候选包含私有恢复能力、几何修复和 Engine 测试三个文件。[实施交付记录](../t122/report01.md)

## 已完成的 Windows 用例

Windows x64 10.0.26300，Node 24.21.0，pnpm 12.10.1，Vitest 3.2.7。原有测试使用合成 Vault 和真实本机 Engine HTTP。恢复能力由测试装配注册。

| 原有覆盖 | 实际结果 |
| --- | --- |
| 备份恢复及回读 | 源 Vault 经 `home.dashboard.backup` 返回当前格式已保存板。空目标 Vault 经 HTTP 预览、确认后生成新 revision，重开 Engine 后回读保留实例、配置、显隐和几何。源板、原有备份、合成笔记、专注与习惯状态均逐字节一致。 |
| 零写入预览与重复确认 | 同一损坏板连续两次预览结果一致，VaultFiles 写调用为零，板文件及目录项不变。两个不同幂等键并发确认只有一份成功，另一份返回 `VERSION_CONFLICT`。成功请求同键重放返回同一回执。 |
| 拒绝与保全 | 实测覆盖未知版本、常规旧格式、不可解析 JSON、非法 UTF-8、无效备份、含混关联键、缺少可用尺寸、只读、错 Vault ID、确认内容变更、目标 revision 变更与同 revision 字节变更。已知损坏板恢复前保全原字节。同名保全文件异字节时拒写。保全后原板被改动时，CAS 拒绝覆盖，原件保全副本仍可读。 |

恢复 HTTP 用例 **5 项通过**。连同既有 dashboard-save 和 Kernel 测试，该轮 **14 个文件、103 项通过**，退出码 0。[HTTP 与 Kernel 直接日志](../t122/http-and-kernel.log)

Engine 首页布局读取定向组 **3 项通过**，另有 45 项经名称筛选跳过，退出码 0。[Engine 回归直接日志](../t122/engine-layout-regression.log)

## 待验范围

- 独立 Engine 复跑和独立边界样本未完成。仍待验证只有当前版本标记但来源不明的目标、备份源坏编码的一致性、复制包往返与同 ID 副本隔离、极限坐标和规模下的修复上界、恢复与普通保存交错，以及 Engine 重启后的同键回执与回执丢失路径。原有用例已覆盖成功重开回读和同一运行期间的同键重放。
- W06 仍需登记生产恢复能力，并在 Windows 安装版通过真实入口核对 ACC-DASH-11/12、复制包和用户确认的恢复体验。原型确认范围以评审记录为准。[W06-01](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/tasks/W06-01-home-cutover.md) · [原型评审](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/prototype-review.md)
