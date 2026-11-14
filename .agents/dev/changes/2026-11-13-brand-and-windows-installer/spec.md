# 规格：品牌资产替换与 Windows 向导式安装

> 设计系统重构（四套主题、token、样式架构、字体）的规格在 [design-system.md](design-system.md)，与本文件并列。

背景、来源与当前事实见 [brief.md](brief.md)；实施切片见 [plan.md](plan.md)。本文件是本 change 的行为契约。实施中如发现与本文冲突的事实，先修正本文，再改代码。

> 2026-11-13 已由只读子代理核对过 electron-vite 6.0.0、electron-builder 26.18.0 的源码，以及仓库现状和字体元数据。文中注明“已核实”的条目附有证据。原先待确认的 iA Writer Duo 一项，已因设计系统重构删除该字体而不再需要。

## 1. 品牌源与仓库位置

- 把 `/home/wta/projects/obsidian-huhu/assets/brand/` 下的全部内容（含 `source/`）**按原字节**复制到仓库根目录的 `assets/brand/`。这里是本仓库唯一的品牌来源，其他位置只能引用或在构建时派生，不手工再存副本。
  - 仓库目前没有 `assets/`。
  - 这与归档 `engineering.md:24`“图标放在 `apps/desktop/resources`”的目录约定不同，本条取代它（BR-D1）；收尾时由 `dev-archive` 写入 notes。
- 新增 `assets/brand/README.md`，记录以下内容：
  - 来源仓库与提交：`obsidian-huhu@d527f14`，品牌目录最后修改于 `b225482`。
  - 各文件的用途（见下表）。
  - logo 字标由 Geist（SIL OFL 1.1，`Copyright 2024 The Geist Project Authors`）的字形轮廓化而来。轮廓化后的图形不是字体软件；Geist 的许可中没有保留字体名（已核实，见 §3.3）。
  - SVG `<desc>` 里写的 `src/ui/fonts/LICENSE.txt` 是来源仓库中的路径，本仓库对应的许可位置见 §3.3。
  - 改图要回到来源仓库，改完后整体复制过来。
- SVG 文件不改写（包括 `<desc>`），以保留出处。
- `.gitattributes` 新增 `assets/brand/** -text`。现有第 1 行 `* text=auto eol=lf` 会规范化 SVG 和 txt 的换行，不加这一条，BR-01 的“逐字节一致”就无法成立。

| 文件 | 用途 |
| --- | --- |
| `huhu-icon.svg`、`huhu-icon-{128,256,512,1024}.png` | 应用图标（奶油色圆角底，全身虎虎）。用于打包图标、窗口图标和关于页 |
| `huhu-mark.svg`、`huhu-mark-{128,256,512,1024}.png` | 透明底的全身吉祥物。本次只入库备用 |
| `huhu-mark-mono.svg`（`currentColor`）、`huhu-mark-inverse.svg`（白色） | 24×24 简化猫头，专为小尺寸设计。用于顶栏和启动页顶栏的 23 px 品牌位 |
| `huhu-logo-light.svg`、`huhu-logo-dark.svg` | 640×224 横版 logo，按主题切换。用于启动页主区域 |
| `source/huhu-imagegen.png`、`source/prompts.txt` | 只作出处存档，不打进应用 |

## 2. 应用与安装包图标

- 在 `apps/desktop/electron-builder.yml` 顶层设置 `icon: ../../assets/brand/huhu-icon-1024.png`。这份配置已经有 `../../LICENSE` 这类相对路径的写法。
  - Windows 的 ICO、macOS 的 ICNS 由 electron-builder 生成：ICO 要求源图至少 256 px，ICNS 至少 512 px，1024 满足两者。
  - Linux 图标的取值为 `linux.icon`，其次是 `mac.icon ?? icon`，所以**不要**再单独设置 `mac.icon`，否则会覆盖顶层 `icon`。
  - 已核实：`app-builder-lib` 的 `LinuxTargetHelper.js:148-161`、`iconConverter.js:199-253`、`platformPackager.js:655`。
  - 不向仓库提交派生出的 ICO / ICNS。
- Windows 安装器、卸载器和安装器顶部图标，默认都复用应用图标，不需要单独设置。
- 运行时窗口图标：
  - 在主进程用 electron-vite 6.0.0 的 `?asset` 导入 `huhu-icon-512.png`，并传给 `BrowserWindow` 的 `icon`。
  - 构建产物位于 `out/main/chunks/<name>-<hash>.png`，已被 `files: out/**` 包含，不需要 `extraResources`（已核实：`electron-vite/dist/chunks/lib-*.js:639-705,353,377`）。
  - 主进程类型声明需要加 `/// <reference types="electron-vite/node" />`，因为 `apps/desktop/tsconfig.json` 的 `types` 目前只有 `["node"]`。
  - Windows 和 Linux 需要把它传给 `BrowserWindow` 的 `icon`。
  - macOS 上 `BrowserWindow.icon` 不起作用：打包后用 ICNS；开发模式下要在 `app.whenReady` 后调用 `app.dock.setIcon(...)`，Dock 才会显示虎虎。
  - Linux 在 Wayland 下，窗口和任务栏图标主要取自 `.desktop` 文件，开发模式的表现不可靠。
- 不新增图标生成依赖。只有实测 16 / 24 / 32 px 的 ICO 帧明显发糊时，才评估用 `huhu-mark-mono` 绘制小尺寸帧来合成 ICO，结论记入 §6。

## 3. 界面品牌位与许可

### 3.1 品牌位

| 位置 | 代码（基线 `8283c5c`） | 目标 |
| --- | --- | --- |
| 窗口顶栏 | `packages/workbench/src/shell/AppShell.tsx:110` 的 `<span className="brand-mark">h</span>`；样式在 `packages/ui/src/styles/proto/style.css:295-309`（23×23，`background: var(--text)`） | 显示 `huhu-mark-mono` 猫头，颜色跟随主题文字色。推荐用 CSS `mask-image` 加 `background-color: var(--text)`，这样不需要内联 SVG。尺寸和对齐保持不变，“huhu workbench” 文字不变 |
| 启动页顶栏 | `packages/workbench/src/launch/LaunchPage.tsx:53` | 同上 |
| 启动页主区域 | `LaunchPage.tsx:62-68` 的 `.vault-illustration`（FolderOpen 图标）；布局见 `proto/vault.css:1-22` | 把这个插图换成横版 logo：浅色模式显示 `huhu-logo-light`，深色模式显示 `huhu-logo-dark`。宽度适配左栏，不撑破 `0.95fr` 栅格 |
| 关于页 | `packages/workbench/src/settings/AboutPage.tsx:38` 的 `.about-mark`（`system.css:1043` 为 76 px；`:1667` 在 760 px 以下为 58 px；`:1801` 在 520 px 以下隐藏） | 显示 `huhu-icon.svg`，沿用现有的尺寸和响应式规则 |

- 可访问性：logo 和关于页图标设 `alt="HUHU"`。顶栏旁边已有文字，猫头设 `aria-hidden`。
- **资源加载**：
  - workbench 是 TS 源码，由渲染进程的 Vite 直接编译（`packages/workbench/package.json` 的 `exports` 指向 `src/index.ts`），因此可以直接 import 仓库根下的 `assets/brand/*.svg`，得到同源 URL。
  - 新增 `packages/workbench/src/assets.d.ts`，声明 `*.svg` 和 `*.png` 为 `string`，不引用 `vite/client`。
  - Vite dev 的 `fs.allow` 默认放行到 workspace 根，实施时需要实测确认。
- **不修改** `apps/desktop/src/renderer/index.html` 中的 CSP。现有策略已包含 `img-src 'self' data:`，同源 SVG 和 CSS mask 都能加载。
- 样式只使用公开 token（`--text` 等），不新建 token。BR-S1 若先于设计系统的 DS-S2 合入，就改在现有规则中，由 DS-S2 迁移；若在其后合入，就直接写在新目录（`packages/workbench` 的外壳样式）中。按 `dev-ui-design` 在四套主题的浅色、深色下检查真实渲染。

### 3.2 主题

`applyAppearance` 会在根元素上设置 `data-theme`（设计系统重构后为 claude / apple / notion / vercel）和 `data-mode`（light / dark）。logo 的切换只看 `data-mode`：两张图都渲染，用 `[data-mode="dark"]` 选择器控制显示哪一张。不新增 JS 判定，切换主题时立即生效。

### 3.3 字体与第三方声明

字体随设计系统重构整体替换，规则见 [design-system.md §7](design-system.md#7-字体)：
- 改用 Fontsource 包：Inter、Newsreader、Geist、Geist Mono、JetBrains Mono，均为 OFL 1.1。
- 删除 `proto/fonts.css`，以及 Outfit、Manrope、Instrument Serif、iA Writer Duo。

本 change 负责的声明部分：
- `scripts/gen-notices.mjs` 生成“## 随包字体”一节，放在“随包二进制与运行时”之后。
  - 内容包括每个字族的版权行与来源 URL（从各 Fontsource 包的 LICENSE 读取），以及 **OFL 1.1 全文**（只放一份）。
  - 写明 HUHU logo 的字标是 Geist 字形的轮廓化图形（logo SVG 的 `<desc>` 已声明）。
- 字体信息不写入 `docs/upstream/ledger.md`，那份台账只登记复制的源码。
- 这部分由设计系统的 DS-S1 实施（字体是在那一步替换的），验收为 BR-06。

## 4. Windows 安装器

### 4.1 用户可见流程

在 Windows 10 或 11 上双击 `HUHU-<版本>-win32-x64.exe`。安装包未签名，SmartScreen 弹出时选“仍要运行”。之后依次经过：

1. **安装范围**：“仅为我安装”或“为使用这台电脑的所有人安装”。全新安装时默认选中“仅为我”（`selectPerMachineByDefault` 默认 false，已核实：`multiUser.nsh:135-152`）。
   - 已经装过时，默认沿用上次的范围。
   - 当前用户不是管理员时，“所有人”选项可以选，选中后会请求提权（`allowElevation` 默认 true）。
2. **安装位置**：给出默认目录，提供“浏览…”按钮。所选路径如果不以 `HUHU` 结尾，安装器会自动追加 `\HUHU`（`assistedInstaller.nsh:33-38`），例如选 `D:\My Apps`，实际装到 `D:\My Apps\HUHU`。默认目录如下：
   - 仅为我：`%LOCALAPPDATA%\Programs\HUHU`。
   - 所有人：`C:\Program Files\HUHU`。
   - 已安装过：沿用注册表中的 InstallLocation。从 rc 版的一键安装升级时，旧目录名来自包名的 `sanitizedName`（例如 `@huhu/desktop` 派生出的名字），不是 `HUHU`，升级后会继续沿用这个旧目录名（`NsisTarget.js:270`、`targetUtil.js:40-42`）。
3. **安装进度**。如果 HUHU 正在运行，会先提示关闭（`CHECK_APP_RUNNING`）。
4. **完成**：带“运行 HUHU”复选框，默认勾选。

安装界面只有简体中文（D-28），不显示许可协议页，也不显示组件选择页。

### 4.2 安装结果

- 文件装到所选目录，开始菜单和桌面各有一个使用虎虎图标的 “HUHU” 快捷方式。
- “设置 → 应用”中能看到 HUHU。卸载器使用虎虎图标，**不删除任何 Vault**。`userData` 的处理保持 electron-builder 默认（不删除）。
- **覆盖安装与升级**（已核实）：
  - 同一 appId 生成相同的 GUID，因此从 rc 版的一键安装（按用户）升级到向导版时，会识别出旧的按用户安装，默认选中“仅为我”和旧目录。
  - 安装前，安装器会用 `/S /KEEP_APP_DATA` 静默运行旧版卸载器，所以不会出现两份并存的安装（`installSection.nsh:52-58`、`installUtil.nsh:142-243`）。
  - 用户如果改选“所有人”，安装器还会额外卸载当前用户下的旧版本。
- 随包内容（`resources/cli`、`resources/bin/huhu.cmd`、`resources/herdr/win32-x64`）都位于所选目录下。安装在带空格的路径（如 `D:\My Apps\HUHU`）时，`huhu.cmd` 也能正常运行 CLI。

### 4.3 配置

```yaml
nsis:
  oneClick: false
  perMachine: false              # oneClick:false + perMachine:false → 显示安装范围页
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: HUHU
  runAfterFinish: true
  installerLanguages: [zh_CN]    # 只插入 SimpChinese；不显示语言选择框（displayLanguageSelector 默认关）
  language: "2052"               # 只影响 exe 版本资源的语言字段
  # 不要设置 multiLanguageInstaller: false —— 那会把语言固定为 en_US 并忽略 installerLanguages（nsisLang.js:17-28）
```

- 已核实 `nsisOptions.d.ts:208-231`、`nsisLang.js:16-60`、`NsisTarget.js:495-509`：
  - `language` **只**写入 exe 版本资源，不决定界面语言。
  - `multiLanguageInstaller: false` 会让 `langs` 固定为 `["en_US"]`，并忽略 `installerLanguages`，产出的是**英文**安装器。所以不能设置它（第二轮顾问审查核实，`nsisLang.js:17-28`）。
  - `installerLanguages` 不设置时，会内置 26 种语言并按系统语言选择。
  - zh_CN 对应 NSIS 的 `SimpChinese`，向导中“仅为我 / 所有人”等文案都有中文翻译。
- 实施时需要实测：在英文系统的 Windows 上，界面也显示中文。
- `allowElevation`、`deleteAppDataOnUninstall`、`selectPerMachineByDefault` 都保持默认，不需要写出来。
- `release.yml` 的 Windows 冒烟测试使用 `win-unpacked/HUHU.exe`，上传时用 `*.exe` 通配，所以不需要改。归档 `release.md:51` 提到的 `/S` 静默安装冒烟，在当前 CI 中**不存在**。如果以后加上，静默安装默认按用户安装，不弹出安装范围页。

## 5. 验收

> 编号前缀为 `BR-`。“Windows 实机”指 Windows 10 或 11 x64 的实机或虚拟机；交互式安装不能用 CI runner 代替。

- [ ] BR-01 `diff -r /home/wta/projects/obsidian-huhu/assets/brand assets/brand` 只差新增的 `README.md`，`git ls-files --eol assets/brand` 显示没有换行转换。仓库中没有派生出的 ICO / ICNS。
- [ ] BR-02 三平台打包产物都使用虎虎图标：
  - Windows：exe 文件图标、安装器、卸载器、开始菜单与桌面快捷方式、任务栏。
  - macOS：DMG 内的 `.app` 和 Dock。
  - Linux：AppImage，以及 deb 安装后的应用菜单项。
- [ ] BR-03 开发模式和打包模式下，窗口或 Dock 图标都是虎虎。
  - Linux 必验：X11 下用 `xprop _NET_WM_ICON` 或截图判定；Wayland 下只验打包产物。
  - macOS 开发模式靠 `app.dock.setIcon` 生效。
  - Windows 和 macOS 抽验。
- [ ] BR-04 顶栏、启动页顶栏、关于页不再出现文字 “h”。启动页左栏显示横版 logo，切换浅色 / 深色后立即换图，760 px 和 520 px 两种窄屏下布局不破。现有 e2e 没有依赖 “h”，`shell.spec.ts:79-81` 中 title 和 appInfo 为 “HUHU” 的断言保持通过。
- [ ] BR-05 CSP 没有改动，渲染进程控制台没有图片加载错误。
- [ ] BR-06 `THIRD_PARTY_NOTICES.md` 包含“随包字体”一节，内含 5 个字族（Inter、Newsreader、Geist、Geist Mono、JetBrains Mono）的版权行和 OFL 1.1 全文。连续运行两次 `pnpm notices`，结果没有差异。
- [ ] BR-07（Windows 实机）安装向导依次出现安装范围、目录、进度、完成四页，默认选中“仅为我”。**在英文系统上界面也是中文。** 把目录改为 `D:\My Apps` 后，文件实际装在 `D:\My Apps\HUHU`，快捷方式指向那里，应用能启动并打开 Vault。
- [ ] BR-08（Windows 实机）选“所有人”时弹出 UAC。同意后安装到所选目录（默认 `C:\Program Files\HUHU`）。拒绝提权时，不弹出错误，回到安装范围页，可以改选“仅为我”继续（`multiUserUi.nsh:166-182`）。
- [ ] BR-09（Windows 实机）安装在带空格的目录时，`huhu.cmd --version` 输出与应用版本一致，随包的 Herdr Core 能启动。
- [ ] BR-10（Windows 实机）卸载后，安装目录和快捷方式被移除，Vault 原样保留。从 **rc.2 一键安装版**升级到向导版：默认沿用旧的范围和旧目录（记录实际的 sanitizedName 目录名），升级后“设置 → 应用”里只有一个 HUHU，原来的 Vault 可以继续打开。
- [ ] BR-11 三平台 Release 工作流照常产出 `HUHU-<版本>-win32-x64.exe`、`.dmg`、`.AppImage`、`.deb` 和校验和，打包后的 E2E 子集通过。

## 6. 已作出的取舍

| 编号 | 决定 | 理由 / 替代方案 |
| --- | --- | --- |
| BR-D1 | 品牌源放在仓库根目录的 `assets/brand/`，作为唯一来源；取代归档 `engineering.md:24` 的图标位置约定 | 品牌资源同时供打包（apps/desktop）和界面（packages/workbench）使用，根目录最中性。替代方案是放在 `apps/desktop/build/`，但那样界面包要反向引用应用包的目录 |
| BR-D2 | 由 electron-builder 从 1024 px 的 PNG 生成 ICO / ICNS，主进程用 `?asset` 取窗口图标 | 复用优先第 ③ 项：使用现有框架能力，不新增依赖，也不加 `extraResources` |
| BR-D3 | 小尺寸位置用 `mark-mono` 猫头，并以 CSS mask 着色 | 来源方专门为小尺寸设计了猫头；用 mask 可以跟随主题色，不需要内联 SVG |
| BR-D4 | 安装器让用户选“仅为我 / 所有人”，默认“仅为我” | 用户在 dev-grill 中选定。**这是对归档规格的扩展**：归档 `release.md:7,20` 只写了“按用户安装”。收尾时写入 notes |
| BR-D5 | 产物名保持 `HUHU-<版本>-win32-x64.exe`，不加 `-setup` | 与当前代码和已发布的 rc 一致。归档 `release.md:7` 中的 `-setup` 是陈旧描述 |
| BR-D6 | 安装器只提供简体中文，不显示许可协议页 | D-28 规定单语言；GPL 不要求安装时点击同意，`LICENSE` 已随包附带 |
| BR-D7 | logo 的明暗切换只靠 CSS 的 `[data-mode]` 选择器 | 复用现有的 `applyAppearance` 属性，不新增 JS |
