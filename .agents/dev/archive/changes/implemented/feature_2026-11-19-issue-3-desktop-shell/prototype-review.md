# #3 桌面外壳原型走查与用户确认

## 入口与依据

- 将 [index.html](prototype/index.html) 用浏览器打开即可操作。顶部是工作台，页尾的「原型演练」提供平台、场景、故障、主题和重置。资料及保存结果存在当前页面内存中。
- 版本为当前 `prototype/` 的六个资源文件，SHA-256 为 `d220319a4d25e3cc0d4ddd17a013e354afc54d4c4118a787b1321ead6d73a02e`。以 `node .agents/skills/dev-prototype/scripts/fingerprint.mjs .agents/dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/prototype --expect <SHA-256>` 复核整个目录。
- 以 Huhu `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10` 的 AppShell、BrandMark、LaunchPage、VaultMenu 和 CommandPalette 为基线。随原型保存了 Huhu 单色品牌图、语义主题和尺寸 token，字体使用设备上的系统回退。 [AppShell](../../../../../../packages/workbench/src/shell/AppShell.tsx) · [LaunchPage](../../../../../../packages/workbench/src/launch/LaunchPage.tsx) · [主题](../../../../../../packages/ui/src/styles/themes.generated.css)
- 核对了 Open Knowledge 默认分支 `main@b2af296a73049ddd47f6d679b36774ecbdd3d19b` 的 `window-chrome.ts` 和 `menu.ts`，参考窗口按钮留位和按平台组织菜单。原型外观、文案、示例和状态均使用 Huhu 自有方案。 [批次源码](../../../../changes/2026-11-19-huhu-issues-3-10/sources.md) · [Issue](source.md) · [规格](spec.md) · [设计](design.md) · [实施计划](plan.md)

## 需求与场景覆盖

| 验收项 | 演练入口与可见结果 | 实际源码 | 后续验证 |
| --- | --- | --- | --- |
| TB-01、02、11 | 从「无 Vault」打开示例，经过启动到工作台。启动可取消。引擎断开后可重启。主页面失败时仍见控制区和重载入口。 | `#titlebar`、`#page`、`start`、`pageContent` | 首帧、独立错误页、预览 iframe 失败隔离 |
| TB-03～05 | 主题选择覆盖四个主题及浅色、深色、跟随系统。窄窗有显式演示开关，可保留搜索或将其收入菜单。长 Vault 名省略，版本在「关于 HUHU」。 | `#theme`、`#mode`、`#compact-choice`、`setTheme`、`#vault-title` | 最小窗口、DPI、跨屏、native overlay 颜色同步 |
| TB-06～10、12 | Windows、macOS 和 Linux 可切换。同一标题栏展示一组窗口控制，macOS 另外展示模拟系统菜单。专注、失焦、最小化、最大化／还原、全屏以独立状态表示。搜索和菜单可键盘操作。 | `#system`、`#native`、`#drag-zone`、`modeStatus`、`keyboardMenu` | 安装版的系统菜单角色、空白区拖动、双击、Snap、边缘缩放、发行版矩阵 |
| TB-12、13、17、18 | 当前焦点文档可由 F10 菜单或快捷键保存，浏览器原型有自己的模拟剪贴板。取消菜单恢复焦点。关闭文档视图、关窗和退出可区分。Web 场景保留导航与搜索。 | `#menu`、`captureEditor`、`saveActive`、`editActive`、`close-document` | 真实编辑器和普通输入框的系统编辑角色、快捷键单次消费、Web 宿主联验 |
| TB-14、15 | 编辑后关窗。模拟超时、版本冲突、写失败或页面失联，支持取消、重试、明确放弃。手动模式关窗保留草稿，重开回到当前示例文档。 | `requestClose`、`tryClose`、`closeError`、`finishClose` | 实际文件、草稿、双击关闭、过期回执、多个窗口、退出时的 Engine 顺序 |
| TB-16 | Web 场景移除模拟窗口控件。窗口交互在单页模型内完成。 | `render`、`#platform` | Main／preload 可信 frame、窗口归属、参数校验及监听清理 |

## 实际走查

2026-11-19 在 WTA 使用 Playwright Core 1.65.1 启动 Microsoft Edge 157.0.4341.60，以 `file://` 打开交付文件。核验本地品牌图和样式加载，拦查页面错误、资源失败和 HTTP 请求，记录均为空。截图为本机临时证据。

- **1366 × 900，Claude 浅色。** 无 Vault → 打开示例 Vault → 启动 → 工作台。在知识库编辑 A 后用 F10 保存，B 保持原值，切回 A 看到保存文本。接着模拟关闭超时，取消后保留未落盘文本。再模拟写入失败，重试后关闭，重新打开时显示最后输入。
- **1366 × 900，macOS 模拟。** 手动模式编辑后关闭，显示「已保留可恢复草稿」。重新开窗见相同文字和「已保留草稿」。系统菜单栏可见。
- **360 × 800，Linux 模拟，Vercel 深色。** 检查长 Vault 名、横向溢出、关闭和搜索控件。进出专注后可关窗。主页面加载失败时仍见窗口按钮，从重载回到原文档。截图检查后收紧面包屑末级标题，最终版本复跑。
- **1024 × 768，Windows 与 Web 模拟。** Alt 打开菜单，Escape 后焦点回到触发按钮。Alt+F4 进入关闭检查。注入版本冲突并明确放弃后恢复上次草稿。走通最大化、还原、全屏、Escape 恢复。切到 Web 后用 Ctrl+K 过滤并进入任务模块。切回 Windows 后注入引擎断开并重启，最后重置。
- 临时证据为系统 `%TEMP%` 下的 `huhu-t18-prototype-qa.cjs`、`huhu-t18-shell-wide.png` 和 `huhu-t18-shell-narrow.png`。本轮运行浏览器模拟。三平台安装产物、系统窗口管理、显示器缩放、真实落盘、完整菜单矩阵与读屏设备仍待执行。

## 用户反馈与确认

2026-11-21 用户在批次会话确认采用八份完整原型。本页对应资源包指纹为 `d220319a4d25e3cc0d4ddd17a013e354afc54d4c4118a787b1321ead6d73a02e`，实施按本 Change 与 Issue 的验收场景推进。

**用户于 2026-11-20 确认窗口菜单、文档保存与关闭反馈。** 确认对象为指纹 `d220319a4d25e3cc0d4ddd17a013e354afc54d4c4118a787b1321ead6d73a02e` 的完整资源包。用户在批次会话选择「确认这两个版本及上述场景」。统一顶部、三平台布局及未提及的窗口动作仍分别按对应场景验收。

演示约定为 Windows 与 Linux 控件在右、macOS 红黄绿在左、非全屏保留窗口控件。窄窗默认保留独立搜索按钮，可从演练区对照「搜索收进菜单」。HTML 中的窗口几何与错误页是演示。Linux 安装支持范围、原生矩形和实际窗口行为待宿主验证。
