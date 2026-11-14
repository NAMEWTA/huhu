# 需求简报：品牌资产替换、设计系统重构与 Windows 向导式安装

## 用户目标

1. 用 `obsidian-huhu` 仓库中定稿的“虎虎”品牌替换 HUHU 工作台当前的品牌表现。范围包括应用图标、窗口与安装包图标、界面里的 logo / 标识位，以及仓库内的品牌源文件。
2. **设计系统整体重构**（2026-11-13 第二次补充）：以用户提供的四份 DESIGN.md（claude、apple、notion、vercel，存放在 [design-refs/](design-refs/)）为准，重构整个项目的外观。
   - 四套主题都提供浅色与深色，可以自由切换。
   - 主题外观要抽象成数据，以后新增配色或支持用户自定义都方便快捷。
   - 项目仍在开发阶段，不需要任何兼容；仓库必须保持最新、最整洁，不留多余或无用的旧代码。
   - 规格见 [design-system.md](design-system.md)。
3. Windows 安装包按常规桌面软件的方式安装：逐步点击“下一步”，可以选择“仅为我 / 所有用户”和安装目录。目前的安装包是一键安装，装完才发现没有选择余地。

本次交付到 `main` 的代码与发布配置，下一次 Release 构建即可得到新图标和向导式安装包。本轮只输出文档，不写代码。

## 来源与已有决定

| 来源 | 版本 / 时间 | 相关事实或用户决定 |
| --- | --- | --- |
| 用户口头需求 | 2026-11-13 本会话 | 复制 `/home/wta/projects/obsidian-huhu/assets/brand`，logo、svg、brand 全部换成它；Windows 安装可以“下一步”并选择安装目录 |
| 品牌源 | `obsidian-huhu@d527f14`，`assets/brand` 最后修改于 `b225482`（2026-11-05 “fix(brand): 协调虎虎全身比例并更新品牌标识”） | 顶层 14 个文件，另有 `source/` 下 2 个文件，清单见 [spec.md §1](spec.md#1-品牌源与仓库位置) |
| 用户决定（dev-grill） | 2026-11-13 | 安装范围：**让用户在向导中选择“仅为我 / 所有用户”**，然后选择目录 |
| 用户补充 | 2026-11-13 | 提供 VoltAgent/awesome-design-md 中 claude、apple、notion、vercel 四份设计，要求克隆进 change、完整重构项目设计、四套主题可切换、抽象便于扩展与自定义、无兼容、无旧代码 |
| 用户决定 | 2026-11-13 | 默认主题为 **Claude**；品牌源图形没有被修改过 |
| 设计参考 | VoltAgent/awesome-design-md@`fcc7028`（MIT） | 四份 DESIGN.md 原样保存在 `design-refs/<名称>/`，并附上游 LICENSE |
| 归档发布规格 | `archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/release.md:7,20` | 原设计就是 NSIS“按用户安装、可选安装目录”，配置为 `oneClick:false, perMachine:false, allowToChangeInstallationDirectory:true`，但**从未落地到 `electron-builder.yml`** |
| 长期决定 | `notes/context/workbench.md`（D-25、D-28） | 不签名、不公证、不自动更新；不做多语言（界面只有中文） |

## 当前事实（HEAD `8283c5c`，2026-11-13 核对）

- **仓库内没有任何品牌图片**。`git ls-files` 中没有 SVG、PNG、ICO、ICNS 文件（`temp/` 下的第三方图标除外）。
- `apps/desktop/electron-builder.yml` 没有 `icon`，也没有 `directories.buildResources`，三平台都使用 Electron 默认图标。`apps/desktop/build/` 目录不存在。
- Windows：`win.target: nsis (x64)`，`artifactName: HUHU-${version}-win32-x64.${ext}`，**没有 `nsis` 块**。electron-builder 26.18.0 的默认值是 `oneClick: true`、`allowToChangeInstallationDirectory: false`，所以当前产物是一键安装、不能选目录。
- `apps/desktop/src/main/index.ts:66-77` 创建 BrowserWindow 时没有传 `icon`，Linux 窗口和任务栏会显示默认图标。
- 界面中有三处品牌位，都用文字 “h” 占位：
  - 窗口顶栏：`packages/workbench/src/shell/AppShell.tsx:109-112` 的 `.brand-mark`，23×23，深底反白。
  - 启动页：`packages/workbench/src/launch/LaunchPage.tsx:52-55`。
  - 关于页：`packages/workbench/src/settings/AboutPage.tsx:38-40` 的 `.about-mark`。
- 样式位置：`packages/ui/src/styles/proto/style.css:286-309`、`refinement.css:436-441`、`system.css:1043,1667,1801`。
- 渲染进程的 CSP 为 `img-src 'self' data:`（`apps/desktop/src/renderer/index.html:5`），Vite 打包后的同源资源可以加载。
- 没有托盘、splash、README 图片、文档站或 favicon，这些位置无需替换。
- 仓库内没有图标生成工具。electron-builder 会从 `icon.png`（≥ 512，推荐 1024）自动生成 ICO 和 ICNS。
- 字体许可缺口：
  - 新 logo SVG 的 `<desc>` 声明 HUHU 字标由 Geist 650 轮廓化而来（SIL OFL 1.1），并指向 `src/ui/fonts/LICENSE.txt`，这是 obsidian-huhu 仓库里的路径。
  - 本仓库 `packages/ui/src/styles/proto/fonts.css:1` 也引用了 `src/ui/fonts/LICENSE.txt`、`src/theme/fonts/LICENSE.txt`，这两个文件都不存在。
  - `THIRD_PARTY_NOTICES.md` 和 `docs/upstream/ledger.md` 都没有 Geist / OFL 条目。
- `release.yml` 的 Windows 冒烟使用 `win-unpacked/HUHU.exe`，上传时用 `*.exe` 通配，不依赖安装器类型。

## 范围与非目标

范围：

- 把品牌源原样复制进仓库，作为唯一来源，并记录出处与许可。
- 生成三平台应用图标（Windows ICO、macOS ICNS、Linux PNG）以及 Windows 安装器 / 卸载器图标。
- 运行时窗口图标（Linux 必需）。
- 替换界面的三处品牌位，支持浅色 / 深色主题。
- NSIS 改为向导式：先选“仅为我 / 所有用户”，再选目录，安装后创建快捷方式，完成后可以启动。卸载不删除 Vault。
- 补齐随包字体（OFL 1.1）的第三方声明。字体随设计系统重构改为 Fontsource 包，旧的 `fonts.css` 删除（见 [design-system.md §7](design-system.md#7-字体)）。
- 设计系统重构：四套主题、token 架构、样式目录与守护规则，全部范围见 [design-system.md](design-system.md)。

非目标：

- 代码签名、公证、自动更新（D-25 保持不变）。
- 多语言安装界面（D-28）：安装器只使用简体中文。
- macOS DMG 背景图、Linux 桌面主题图标集、营销页、README 美化。
- 修改品牌源图形本身。如需改图，应回到 obsidian-huhu 修改后重新复制。
- 修改产物命名。保持 `HUHU-${version}-win32-x64.exe`；归档规格中的 `-setup` 后缀是旧设计，不在本次追随范围，见 [spec.md §6](spec.md#6-已作出的取舍)。

## 成功条件

详见 [spec.md §5 验收](spec.md#5-验收)。要点如下：

- 在 Windows 上双击安装包后，看到的是多步向导：选择安装范围 → 选择目录 → 安装 → 完成（可勾选“运行 HUHU”）。按所选目录完成安装，开始菜单和桌面快捷方式都使用虎虎图标。
- 三平台的安装产物、已安装应用、窗口 / 任务栏 / Dock 都显示虎虎图标。
- 顶栏、启动页、关于页不再出现文字 “h”，在四套主题的浅色和深色下都清晰。
- 四套主题可以在外观页自由切换，满足 [design-system.md §10](design-system.md#10-验收) 的验收。

## 待决问题

无阻塞项。以下事项交给实现阶段核对，不需要用户决定：

- 应用图标在 Windows 小尺寸（16 / 24 / 32 px）下的清晰度。如果 electron-builder 由 1024 PNG 缩放得到的 ICO 在 16 px 下发糊，再评估是否用 `huhu-mark-mono` 风格的小尺寸帧手工合成 ICO。这需要实测后决定。
