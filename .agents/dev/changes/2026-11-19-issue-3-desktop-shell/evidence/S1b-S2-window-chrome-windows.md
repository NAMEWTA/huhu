# Windows 单条原生标题栏

核对的原型指纹为 `d220319a4d25e3cc0d4ddd17a013e354afc54d4c4118a787b1321ead6d73a02e`，按确认的窄窗口方案保留独立搜索。对照独立审查 report04 的标题栏、焦点、全屏和主题问题。关联验收为 TB-01～05、TB-07、TB-09～12、TB-14～16。

## 来源与改动

在本机 `temp/sources/open-knowledge` 读取 `b2af296a73049ddd47f6d679b36774ecbdd3d19b` 的 `packages/desktop/src/main/window-chrome.ts`，该文件与固定提交相同，仓库采用 GNU GPL v3。沿用按平台设置原生装饰、用同一高度生成和更新 overlay、仅在仍存在的窗口更新颜色的结构。本实现采用一套 Huhu 标题栏几何，颜色来自现有主题表和 Renderer 已生效的根 token。新增的窗口快照、可信文档与窗口归属校验、恢复页和主题同步沿用 Huhu 的宿主边界。 [上游源码](https://github.com/inkeep/open-knowledge/blob/b2af296a73049ddd47f6d679b36774ecbdd3d19b/packages/desktop/src/main/window-chrome.ts) · [上游许可证](https://github.com/inkeep/open-knowledge/blob/b2af296a73049ddd47f6d679b36774ecbdd3d19b/LICENSE) · [Electron 44.9.1 标题栏文档](https://github.com/electron/electron/blob/v44.9.1/docs/tutorial/custom-title-bar.md)

Windows 和 Linux 使用 `titleBarStyle: "hidden"` 及原生 `titleBarOverlay`，macOS 保留红黄绿及原系统菜单。前端从 `env(titlebar-area-*)` 使用可用矩形，暂缺时用平台余量，全屏按 BrowserWindow 实态撤掉余量。拖动仅标记空白带，应用菜单、Vault、搜索、预览与弹层保有自己的指针和键盘输入。Web 使用原浏览器导航和搜索。系统窗口名由 Main 从 Vault 显示名计算，渲染器页面标题无法覆盖它。 [Electron 44.9.1 窗口交互文档](https://github.com/electron/electron/blob/v44.9.1/docs/tutorial/custom-window-interactions.md)

启动、Engine 状态与正常工作台共用 `WindowTitleBar`。工作台主文档加载失败或进程崩溃后的内置页保留同一个窗口和原生控件，错误页本身不具备窗口桥接。可重载工作台。若在该错误页关窗而引擎仍开着，宿主明确告知无法确认保存结果，并保持「保留窗口」为默认。

## Windows 复跑

- Windows 11 Pro 64 位，构建 26300。本机 Electron 44.9.1，捆绑 Chromium 152.0.7977.167。命令为 `playwright test tests/e2e/window-chrome.spec.ts --workers=1`。运行 Electron 生产构建，使用隔离 Vault 和同机回环。
- 960×600 的启动、工作台和长中文／emoji 名称以 Electron 实际标题区域测量。Win32 `WM_NCHITTEST` 在 DPI 96 逐项验证窗口端识别的拖动、最小化、最大化、关闭和普通应用菜单命中。 `PrintWindow` 取到含系统按钮的本窗画面。
- 测试覆盖失焦、最小化、最大化与还原，系统全屏进出，浏览器 1.5× 缩放，四主题八套明暗组合和模拟的系统配色切换，保留当前标签的搜索、Vault 弹层及关窗保存。
- 独立起浏览器访问回环 Web。HTML 预览用实际沙箱 iframe 测文本选择及宿主隔离。用不可连接的本地地址复现主框架加载失败，并用 `forcefullyCrashRenderer` 核对错误页与重新进入工作台。

macOS、Linux X11／Wayland、发行版安装包、Win11 Snap 面板悬停、原生显示器间 DPI 切换和物理鼠标手势仍需各自宿主运行证据。网页 1.5× 缩放的通过只覆盖 Web 内容几何。
