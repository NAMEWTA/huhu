# P2.1 与 P2.2 彩色标签和账号搜索验收

2026-11-21，在 Windows x64 26300 上从 `e2f84e9d` 构建本切片。使用 Node 24.21.0、固定 pnpm 12.10.1、Playwright 1.65.0 和 Electron 44.9.1 / Chromium 152.0.7977.167。复算原型目录指纹与用户确认的 `d3b206857caed6e0e1d2c0d6ee505a0387c8f44fdedc249efd578de4f4d13f83` 一致。使用临时本机 Vault 与合成数据。

| 验收 | 实际观察 |
| --- | --- |
| 新建、复用和关联 | 桌面标签管理重复输入同名标签，目录仍有一个标签并保留原色。在条目表单应用已有与草拟的新标签，一次保存两个关联。在编辑已保存条目时勾选同一个标签，管理页统计两个条目。放弃另一份草稿后，其内联标签未出现在目录。 |
| 改名、换色和删除 | 两个关联条目都显示新名称与紫色标签。试图改成已占用名称时提示冲突，输入和原关联保留。取消删除后仍见两个关联，确认删除后两个条目及账号仍可读。Engine 重开后也只读到当前目录和无悬空引用的条目。 |
| 同代提交 | 由真实 Engine 调用施加故障，覆盖条目与草拟标签写入失败、多个关联删除时锁定、标签密文暂存失败，以及全部新密文到位后清单发布失败。前一代清单仍完整，最终发布失败回收了本次安装的文件。重试成功后重开读到新代。 |
| 标签交集与搜索 | 「全部」「无标签」与独立标签的组合生效，多标签取交集并叠加搜索。名称、网址、标签有结果，邮箱、备注及手机号命中时打开同名账号中的第二个。密码独有词的结果数为零。 |
| 锁定与隐私 | 搜索及选择账号后锁定，查询、筛选和详情卸载，重新解锁恢复全部与空查询。延迟一条已成功的标签目录响应，待外部锁定后释放，列表与筛选仍为空。检查临时 Vault 文件与真实全局 `vault.search`，标签和合成账号字段均无明文命中。 |

## 复跑

在本 worktree 中使用任务指定的固定 pnpm。以下命令使用已准备的依赖目录。

```powershell
& $lockedPnpm --config.verify-deps-before-run=false --offline --filter @huhu/desktop exec electron-vite build --logLevel warn
& $lockedPnpm --config.verify-deps-before-run=false --offline exec playwright test tests/e2e/workflows/safe-tags.spec.ts --trace off --output test-results/safe-tags-task02-final
& $lockedPnpm --config.verify-deps-before-run=false --offline exec playwright test tests/e2e/workflows/safe-tags.spec.ts tests/e2e/shell.spec.ts -g '保险箱[：标签]' --trace off --output test-results/safe-tags-task02
& $lockedPnpm --config.verify-deps-before-run=false --offline exec vitest run plugins/safe/test
& $lockedPnpm --config.verify-deps-before-run=false --offline --filter @huhu/plugin-safe exec tsc --noEmit -p tsconfig.json
```

标签界面 2 项通过，并在默认 Claude 浅色和深色中查看同一组关联标签。联合回归 5 项通过，含已有多账号、窄窗与 Web 普通入口测试。Safe 定向测试 3 个文件共 36 项通过。Electron 构建、Safe 类型检查、oxlint、stylelint、oxfmt 和 Git 差异检查通过。

## 剩余验收

- 标签和搜索的失败恢复已在单实例桌面和真实 Engine 中验证。真实工作台切换 Vault 时的 P2 查询竞态、超大 Vault 的标签目录读取负载及其他主题组合待验。
- 本切片的标签能力按桌面入口注册。外部敏感访问策略、安装包、备份及 Git 同步由各自切片验收。
