# task12.md · #3 单条原生窗口标题栏

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task12.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task12.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report12.md
- 执行结果 — done
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — `impl/huhu-issues-3-10-window-chrome`
- 基线 — `7367e1f7d24eaa591ac22e32a1f9948227599d75`
- HEAD — `688122c1304ed393c19919f8ff1b07f486785c27`

## 提交

| 提交 | 交付 |
| --- | --- |
| `b48d35550da13d8e2fcbe42df387c2e48cc6e8fb` | S1b 采用 Electron 原生控件。添加窄窗口宿主桥，仅可信顶层工作台操作自身已注册窗口。订阅真实焦点、最大化和全屏。任务切换器标题由 Main 用 Vault 名生成，避免绝对路径。 |
| `51facc511c4169bb2ee05ec25d70bd51a36421af` | S2 启动、载入和工作台复用同一标题栏。读取 Electron 可用区及平台回退，空白拖动带和交互控件各有边界。现有外观控制器应用根样式后同步原生配色。Renderer 失败或崩溃时内置错误页可重载，也可通过原生窗口控件进入关窗流程。 |
| `688122c1304ed393c19919f8ff1b07f486785c27` | 用 Win32 命中核对全屏原生按钮和拖动区的实际消失，验证错误页的明确关闭许可，修复旧关窗用例在启动加载尚未完成时注入失败页面的竞态。 |

对照独立审查的双标题栏、主题和原生控件缺口，核对已确认原型的六文件指纹 `d220319a4d25e3cc0d4ddd17a013e354afc54d4c4118a787b1321ead6d73a02e`。本机 Open Knowledge `b2af296a73049ddd47f6d679b36774ecbdd3d19b` 的窗口装饰文件与固定提交一致，GPL v3。沿用其平台装饰和 overlay 更新结构，尺寸和配色来自 Huhu。 [审查报告](<D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1bh/report04.md>) · [来源、平台与取证](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/evidence/S1b-S2-window-chrome-windows.md>)

## Windows 验证

| 范围 | 实测 |
| --- | --- |
| 原生几何及窗口状态 | Windows 11 Pro x64，构建 26300，DPI 96，Electron 44.9.1／Chromium 152.0.7977.167。启动页、工作台 960×600 和长中文／emoji 名使用实际 `titlebar-area` 矩形。Win32 `WM_NCHITTEST` 确认拖动带、三键和应用菜单分别命中正确区域。全屏中即使 Chromium 的 overlay visible 保持 true，原三键位置及拖动带均实际转为客户区。退出全屏后恢复正常几何。另验失焦、最小化、最大化、还原与 1.5× Web 内容缩放。 [启动原生截图](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task12-window-chrome/delivered-artifacts/window-chrome-launch-and-w-26831-size-with-a-long-Vault-name/window-caption-launch.png>) · [工作台原生截图](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task12-window-chrome/delivered-artifacts/window-chrome-launch-and-w-26831-size-with-a-long-Vault-name/window-caption-workbench.png>) · [全屏原生截图](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task12-window-chrome/delivered-artifacts/window-chrome-native-capti-de8d1-izing-and-system-fullscreen/window-caption-fullscreen.png>) |
| 外观和实例边界 | 四个主题各自的浅色及深色都对比页面根 token 和实际传给 `setTitleBarOverlay` 的三项参数。通过模拟系统配色验证现有监听及切换，将非法颜色拒绝在 Main。沙箱 iframe 能实际选字，且无自身或父窗口桥接。回环浏览器只显示应用导航与搜索。 |
| 真实恢复及旧关窗保存 | 连接失败进入内置页，确认原生控制区、无窗口桥接和活动 Engine 下的明确关闭选项。强制 Renderer 崩溃后捕获真实恢复页并重载回工作台。现有 17 个关窗和草稿回归覆盖等待、失败、取消、重试、活动文档保存、关窗／退出合并与实际文件回读。 |
| 最终 Playwright | 组合命令运行 `tests/e2e/window-chrome.spec.ts`、`tests/e2e/knowledge/session-flush.spec.ts`、`tests/e2e/knowledge/editor-s3-menus.spec.ts`、`tests/e2e/states.spec.ts`。29 项通过，1 项要求 POSIX 只读权限的用例按平台条件跳过。 [完整日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task12-window-chrome/delivered-workbench.log>) · [原生全屏及恢复定向复跑](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task12-window-chrome/candidate-targeted.log>) |
| 构建与静态检查 | 生产桌面构建标记 `688122c`。全仓 TypeScript、范围内格式与 lint、主题颜色和 CSS 层、类、归属、重复检查，以及 `git diff --check 7367e1f7..HEAD` 通过。 [构建日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task12-window-chrome/delivered-desktop-build.log>) · [TypeScript 日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task12-window-chrome/final-types.log>) |

Windows 验证使用构建产物、隔离 Vault 和回环网络。安装包、Win11 Snap 面板悬停、物理移动和边缘缩放手势、跨显示器 DPI，以及 macOS、Linux X11／Wayland 待相应宿主验收。应用菜单、关窗事务和预览安全策略沿用既有实现。变更仅在指定的 Desktop、Workbench、#3 测试和证据路径内，工作树干净，临时依赖 junction 已清理。实施起点由用户明确指定，发布报告时共享清单已登记 `t18v/task12.md` 为 active。

## Lead 验收

由 Lead 追加。
