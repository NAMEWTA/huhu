# #3 单条原生窗口标题栏 · S1b 与 S2

共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t18v
task task12.md
report t18v/report12.md

Windows only。在 task-cutover worktree 的 impl/huhu-issues-3-10-window-chrome 开发，基线 7367e1f7d24eaa591ac22e32a1f9948227599d75。读取 #3 source/spec/design/plan、S1b-01～04、S2-01～04 与用户确认原型。原型全部确认，无需提问。优先修正独立审查 report04 的两条顶栏、失焦/系统全屏与主题联动。只写 apps/desktop/src/{main,preload,renderer}（共享的 apps/desktop/src/window-chrome-ipc.ts 可以新增）、packages/workbench/src/{shell,launch,index.ts,settings/host.ts}、#3 专项测试和证据；禁止改共享 Engine 与根锁。Lead 同时推进 HomeModule 和 #10，避免其目录。现有 Main 原生菜单、app menu context、关窗事务与安全政策要保留。

先核对真实本地 temp/sources/open-knowledge b2af296 的 packages/desktop/src/main/window-chrome.ts，复用原生窗口装饰结构，记录许可证和实际改动。Main Windows 用隐藏标题栏加原生 titleBarOverlay，macOS 采用系统交通灯，Linux 保留系统题栏控件和安全区；真实运行与 test 只在 Windows。外观来自现有 AppearanceController 生命周期和已生成配色，使用 huhu:appearance-changed 与 root 应用后的颜色。复用窄 IPC 方法，仅可信顶层各自 BrowserWindow，可读取并订阅焦点、最大化和全屏，更新白名单颜色。窗口可用标题范围使用 Electron 提供的 env(titlebar-area-*) 加平台保守回退，再处理全屏。交互控件 no-drag，桌面空白可拖；Web 原生浏览器无窗口依赖。Portal 弹层与编辑、搜索、选字和排版不应被 drag 影响。统一 Huhu 标题槽复用启动、载入/崩溃恢复和工作台。内置错误页仍有安全拖动区和原生控件。保持现有标题右侧布局和产品行为；任务切换标题不能含绝对路径。Lead 已执行 MWG 两次 search 后 retrieve form-factor-adaptation,css-layout,dark-mode,color，读完整文件 C:/Users/cdewta/AppData/Local/Temp/mwg-guide-34972-1795216237657.md，Electron 44.9.1 文档核对。请按项目要求读取并应用指南。需覆盖 Windows Electron 测试里的实际 titlebar-area、不同主题、最小窗、长名、最大化/全屏进入退出、iframe 和关闭保存原回归。分步提交。无法实际验的平台及 Snap/DPI 桌面环境边界据实记录。
