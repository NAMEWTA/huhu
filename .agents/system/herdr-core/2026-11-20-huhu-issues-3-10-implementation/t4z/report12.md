# #10 看板备份恢复普通路径独立确认

- terminal_address — t4z
- task — task12.md
- Core — Windows 本机 wta，`346bd5608735e3fcb27f9d01f5c8008e`，0.1.21。
- 执行结果 — done。建议签收 W02-05 私有接口的普通恢复路径。
- 冻结候选 — `95ecb232575813a0f8ccf665e79eec78dd03869d`，树 `374c5f2172a581c6de9193dc196542251ccfe00b`。依据为 W02-05 合同与 t122 交付。 [W02-05](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W02-05-restore-board.md) · [t122 报告](../t122/report01.md)

## 规格轴

- **有效备份跨 Vault 恢复。** 通过真实 Engine HTTP 从源 Vault 取得当前格式备份，在没有已存看板的目标 Vault 预览并确认。目标生成新 revision，保留实例 ID、类型、配置、显隐及几何。关停重开后，`home.dashboard.get` 读回完整已提交看板。源看板、源备份回读及目标的合成笔记、专注、习惯和既有看板备份均与原内容一致。
- **预览与确认。** 连续两次预览得到相同的候选与变更清单，VaultFiles 写入零次，原板字节和目录清单不变。同一用例随后确认，原字节保全一次、整板写入一次，并发的另一确认返回 `VERSION_CONFLICT`。成功请求用原幂等键重放得到同一回执，重开读回修复布局。留在预览阶段的零写入已验证，产品取消按钮仍待 W06 接线验收。 [两个定向用例](evidence-task12/independent.log)

## 规范轴与 W06 接线

冻结 Engine 自带看板备份和读取能力。恢复用例在手工注册 `home.dashboard.recovery.preview` 和 `commit` 前实际收到 `CAPABILITY_NOT_FOUND`，随后通过测试注册走真实 HTTP。候选仍是 W06 前私有接口。普通用户路径剩余的是生产注册、界面预览与显式确认／取消，以及 Vault 包收集接入。界面确认时需提交同一 `intent` 和预览返回的 `confirmation`。本轮通过的是看板备份对象的跨 Vault 恢复。 [W06 接线](../../../../dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W06-01-home-cutover.md)

Windows x64、Node 24.21.0、Vitest 3.2.7。独立 Git 归档仅运行指定的两个冻结用例，**2 通过、3 项按名称过滤跳过**，退出 0。工作区源码来自冻结提交，第三方依赖只读复用本机安装。差异检查通过，归档已删除，测试 pane `t136` 已退出并移除。 [复跑日志](evidence-task12/independent.log) · [归档脚本](evidence-task12/frozen.ps1) · [清理记录](evidence-task12/cleanup.log)
