原始报告位于 `temp/final-audit/t194-task05-final.md`；以下相对源码链接按原报告目录解释。

# t194/task05 首页布局保存与旧读回写复审

Lead `t3p`，审查者 `t194`，状态 `done`。基线 `f55f0759e9d33bdecd6ca92cf6b25837947e3e28`，按下列冻结 blob 审查三个首页文件。 前次独审（历史位置 `t194-task04-final.md`，本次未取得原件） · 实施报告（历史位置 `t176-task22-final.md`，本次未取得原件）

**原 P3 已关闭，三个文件未发现新增规格或规范缺陷。** 使用 TanStack Query 5.107.1 与实际 EngineClient 的独立内存对照，基线在旧读和保存回执同轮解决后缓存回到 revision 1。候选等取消链结束再发布回执，缓存保留 revision 2，旧读取确已完成，因此其信号仍为未中止。旧读取尚在途时，候选中止信号，强行放行旧响应后缓存仍为 revision 2，两条查询状态均为 success。随后真实读错进入 `CapabilityError`，下一次正常 refetch 恢复成功。 [保存回执](../../../../../../../packages/workbench/src/home/useDashboard.ts#L131) · [现有查询键和 signal](../../../../../../../packages/workbench/src/engine-client/react.tsx#L97)

## 生命周期与失败

- 保存和布局恢复都等待 `wrote` 发布缓存再完成。已进入异步保存的离场请求等待同一个 `inFlight`，重复保存复用该 promise。新测试调用实际 UI store 的 `openModule`，验证保存未完成时留在首页，成功后才转入任务。保存错保留草稿，条件冲突仍提示对照，未知结果仍由已有 `checkLatest` 查证，查到匹配的提交布局也等待同一回执处理。 [离场](../../../../../../../packages/workbench/src/home/useDashboard.ts#L66) · [保存与查证](../../../../../../../packages/workbench/src/home/useDashboard.ts#L146) · [复用回执](../../../../../../../packages/workbench/src/home/useDashboard.ts#L278)
- 回执 Vault 与发起 Vault 比对，错误响应不会发布到缓存。等待取消前后都核对活动 QueryClient，卸载清除活动引用。生产 `HomeModule` 按 Vault ID 重挂载首页，`EngineProvider` 按 Vault 更换 QueryClient。测试覆盖带异 Vault ID 的回执和销毁后回执。实际切 Vault 的重挂载由源码核对，本轮没有在包内实跑。 [活动生命周期](../../../../../../../packages/workbench/src/home/useDashboard.ts#L51) · [生产挂载键](../../../../../../../packages/workbench/src/home/HomeModule.tsx#L22) · [旧回执验证](../../../../../../../apps/desktop/test/use-dashboard.test.ts#L149)
- 新包驱动断言成功提示、零读取告警、卡片实际网格行与落盘行同时正确，保留重载后注入真实读取错误并由用户点击重试的部分。两种受控旧读取顺序由单测验证。 [包驱动](../../../../../../../tests/e2e/workflows/dashboard-appearance-package.spec.ts#L49) · [失败与重试](../../../../../../../tests/e2e/workflows/dashboard-appearance-package.spec.ts#L80)

## 证据与版本

现有红灯证明基线在实际 hook 下将磁盘回执对应的 revision 2、`y=1` 覆盖为 revision 1、`y=0`。冻结单测由 jsdom、React `createRoot` 和实际 `EngineProvider` 挂载 `useDashboard`，查询、保存、离场语义均走生产代码，只控制 fetch JSON 与禁用真实事件连接。审查者在 Node 24.21.0 独立复跑 `pnpm exec vitest run apps/desktop/test/use-dashboard.test.ts`，单文件 5/5，退出 0。 红灯（历史位置 `t176-dashboard-receipt-red.log`，本次未取得原件） · 实施绿灯（历史位置 `t176-dashboard-receipt-green.log`，本次未取得原件） · [真实 hook 挂载](../../../../../../../apps/desktop/test/use-dashboard.test.ts#L65) · [竞态闸门](../../../../../../../apps/desktop/test/use-dashboard.test.ts#L96)

| 文件 | 冻结 blob |
| --- | --- |
| `packages/workbench/src/home/useDashboard.ts` | `62d1bca136d236fd14898fe0726b5812da59cf0c` |
| `apps/desktop/test/use-dashboard.test.ts` | `47c57f15818cb226c0ea987b6a389b4321db0d2c` |
| `tests/e2e/workflows/dashboard-appearance-package.spec.ts` | `10caab70e4bac31630ba04ef8bc515ef947dc741` |

本轮未运行 E2E、Electron、打包、构建、全仓类型或全量检查。生产和测试源码保持只读，未启动 agent。
