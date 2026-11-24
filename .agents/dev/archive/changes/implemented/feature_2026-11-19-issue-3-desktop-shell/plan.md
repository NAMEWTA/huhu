> 2026-11-23 归档：本 change 已按当前实现及用户确认范围完成；独立复核见仓库 `.agents/system/herdr-core/2026-11-23-huhu-closeout-release/`。线上账号、跨设备及其他平台实机未验证，不记为通过。原路径 `.agents/dev/changes/2026-11-19-issue-3-desktop-shell`；归档路径 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell`。后续 Issue 状态与版本发布由本轮收尾记录追踪。

# #3 桌面外壳实施索引

让用户从首次打开 Vault 起就能操作一条 HUHU 标题栏，使用系统菜单与窗口控件，在关窗前知道最后一次输入是否已保存。本页按 S0～S4 保留原交付编号。S1a 负责关闭事务，S1b 负责平台宿主，S3 承接 S1 的菜单安装与动作贯通。

[规格和 TB 验收](spec.md) · [平台、关闭和菜单设计](design.md) · [原始 Issue](source.md) · [当前上游检出](../feature_2026-11-19-huhu-issues-3-10/sources.md)

## 执行边界

Huhu 工作树 `feature/issue-fix@9f870c0`，desktop 0.0.1-rc.4 固定 Electron 44.9.1。按捆绑 Chromium 152.0.7977.167 做桌面规划，安装时读取真实运行版本。Web 共享入口按 Baseline Widely available 复核。所有 UI 切片依赖其具体场景的用户确认。可先进行独立的原生测量、IPC、落盘与故障验证。[原型入口](prototype/index.html) · [版本和确认范围](prototype-review.md)

S0-01 可分平台取证，S1a-01 和 S1b-01 可并行。S1b 各平台样例和 S2 共用窗口状态约定，各自验证后在 S4 一次切换。中间整合样例不作可分发版本。Main/index.ts、preload、Root 的共享注册由一名桌面装配者合入。桌面先在 S1a-03 交付可独立验收的退出契约，之后由看板接入。#6 后续提供 Web 入口。

所有者以任务中列出的模块为界。同一装配文件由上文指定的负责人整合。原型锚点用于定位演练入口，实际版本、已覆盖及待补场景以评审记录为准。

## 切片与依赖

末列为 TB- 验收编号，含整合复验。前置列只列产物依赖。界面确认和平台环境见各任务。

| 切片与可见结果 | 依赖切片 | 验收编号 |
| --- | --- | --- |
| [S0-01 采集安装版窗口基线](tasks/S0-01-native-baseline.md) | — | 01、02、06、07、08 |
| [S0-02 走查标题栏与关闭提示](tasks/S0-02-review-shell.md) | — | 02、05、09、10、11、12、15 |
| [S1a-01 关窗前保存最后一次文档输入](tasks/S1a-01-flush-document.md) | — | 14、15 |
| [S1a-02 从关闭失败提示重试或取消](tasks/S1a-02-retry-close.md) | S1a-01 | 14、15 |
| [S1a-03 把关窗升级为一次可取消的应用退出](tasks/S1a-03-quit-transaction.md) | S1a-02 | 14、15 |
| [S1b-01 把真实窗口状态交给所属工作台](tasks/S1b-01-window-host.md) | — | 10、16、18 |
| [S1b-02 在 macOS 保留系统红黄绿](tasks/S1b-02-mac-decoration.md) | S0-01、S1b-01 | 01、05、06、10 |
| [S1b-03 在 Windows 保留贴靠与窗口菜单](tasks/S1b-03-windows-decoration.md) | S0-01、S1b-01 | 01、05、07 |
| [S1b-04 在 Linux 的目标桌面操作窗口](tasks/S1b-04-linux-decoration.md) | S0-01、S1b-01 | 01、08、10 |
| [S2-01 工作台共用一条可交互标题栏](tasks/S2-01-workbench-bar.md) | S1b-01 | 02、03、09、16 |
| [S2-02 在启动与错误页仍可移动和关窗](tasks/S2-02-launch-recovery.md) | S2-01 | 01、11 |
| [S2-03 让标题控制区跟随主题和可用宽度](tasks/S2-03-theme-geometry.md) | S2-01 | 04、05 |
| [S2-04 专注或失焦后仍可操作窗口](tasks/S2-04-focus-fullscreen.md) | S2-01 | 09、10、12 |
| [S3-01 用平台入口打开 HUHU 菜单](tasks/S3-01-product-menu.md) | S2-01、S1a-03 | 03、06、12、17 |
| [S3-02 将保存与编辑命令交给原焦点](tasks/S3-02-editor-focus.md) | S3-01 | 12、13、17 |
| [S3-03 从菜单执行 Vault 和视图操作](tasks/S3-03-workbench-commands.md) | S3-01 | 12、13、17 |
| [S4-01 在三平台安装版验收桌面外壳](tasks/S4-01-install-matrix.md) | S0-02、S1b-02、S1b-03、S1b-04、S2-02、S2-03、S2-04、S3-02、S3-03 | 01、02、03、04、05、06、07、08、09、10、11、12、13、14、15、16、17、18 |

## 发布前仍需确认

Linux 支持的发行版、桌面与 X11/Wayland 组合，以及最小窗搜索入口呈现，分别影响 S1b-04/S4 与 S2-03。按对应场景确认即可继续。三平台安装证据按 OS、会话、DPI 与窗口状态分别记录。Web 或 HTML 画面只覆盖共享 UI。
