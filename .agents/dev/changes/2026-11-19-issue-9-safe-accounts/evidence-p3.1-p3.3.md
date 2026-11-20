# P3.1 与 P3.3 个人多账号工作区验收

2026-11-21，在 Windows x64 26300 上从 `6da1b2ec` 构建本切片。复算已确认的原型指纹为 `d3b206857caed6e0e1d2c0d6ee505a0387c8f44fdedc249efd578de4f4d13f83`。使用 Node 24.21.0、pnpm 12.10.1、Playwright 1.65.0、Electron 44.9.1 内含 Chromium 152.0.7977.167，以及 Chrome 157.0.8103.51。验证只使用独立临时 Vault、自动化浏览器配置和合成账号。

| 验收 | 实际观察 |
| --- | --- |
| 1440×900 桌面创建与编辑 | 从保险箱设置主密码。用键盘打开条目表单、触发必填校验、创建三个账号。列表显示三个账号。长名称、网址和备注可读，电话前导零保留。同名账号可分别选择。Esc 进入放弃确认且继续编辑保留草稿。仅修改公共网址，随后只修改第二个账号备注，分别用其他账号的字段和密码核对更新范围。 |
| 390×844 窄窗入口 | 用 Electron 的 Chromium 视口模拟创建三个账号。进入详情时焦点移到名称，返回后焦点回到原条目。长名称和网址换行，Safe 网格的水平溢出在 1 CSS px 以内。 |
| 写入回执与版本冲突 | 接收 Engine 的成功响应后由自动化丢弃创建回执。界面保留草稿并提示未收到保存确认。按原版本重试收到冲突，刷新核对后仍保留原草稿，列表只有一个三账号条目。第二个本机请求抢先更新时，表单保留本次输入。确认重读后读取已保存内容，重做编辑可以保存。 |
| 显隐与锁定 | 默认遮罩且未经点击时没有 reveal 请求。分别显示、隐藏和切换账号，验证保留、设置与清空密码。空密码显示「未设置」。离开模块时个人页面卸载，返回后重新遮罩。在编辑对话框内锁定后草稿及条目离开 DOM。分别在切换账号和收到外部锁定事件后释放延迟的 reveal 响应，观察页面保持遮罩或锁定。 |
| 权限入口与持久化 | Chrome 使用回环分享邀请打开工作台，保险箱显示桌面提示，返回工作台可用。桌面合成条目的个人字段和密码样本未出现在 Vault 文件中。正常列表与详情调用不含密码，详情和 reveal 在组件状态中处理，工作区未以查询缓存承载个人数据。 |

截图位置由 Playwright 写在工作区的 `test-results` 下，文件名分别为 `safe-desktop-masked.png` 和 `safe-narrow-detail.png`，对应成功的桌面和窄窗场景。桌面截图显示长内容换行及选中的第二个账号。窄窗截图显示详情和返回按钮。

## 复跑

在本 worktree 中使用任务提供的固定 pnpm 执行文件。显式指定 `--config.verify-deps-before-run=false` 以使用已准备的依赖目录。如下命令均通过。

```powershell
& $lockedPnpm --config.verify-deps-before-run=false --offline --filter @huhu/desktop exec electron-vite build --logLevel warn
& $lockedPnpm --config.verify-deps-before-run=false --offline exec playwright test tests/e2e/shell.spec.ts -g '保险箱：' --trace off
& $lockedPnpm --config.verify-deps-before-run=false --offline exec vitest run plugins/safe/test
& $lockedPnpm --config.verify-deps-before-run=false --offline --filter @huhu/plugin-safe exec tsc --noEmit -p tsconfig.json
```

Playwright 3 项通过。Vitest 3 个文件共 34 项通过，含重开读回、离开锁定、损坏清单保留、并发提交、写入中断以及停用和关闭保护。Safe 类型检查在生成工作区 vendor 声明后通过。改动文件的 oxlint、Safe CSS 的 stylelint、oxfmt 和 `git diff --check` 通过。

## 剩余验收

- P3.1 的多标签表单需 P2.1 提供标签目录及写入契约。添加账号到已保存条目需相应账号创建契约。当前仅验证新建条目时一次提交多个账号。
- P3.1 的真实 UI 切 Vault 和 P3.3 的外部敏感读取开关待验。已验证当前页面卸载、手动锁定、外部锁定事件以及 Engine 的 Vault 切换。
- 标签筛选、账号删除和复制、自动锁定实时时长、其他主题及批次安装包留待对应切片验收。
