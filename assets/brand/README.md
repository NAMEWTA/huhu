# HUHU 品牌资产

本目录是仓库内品牌资源的唯一来源。

- 来源：`obsidian-huhu` 仓库的 `assets/brand`，提交 `d527f14`（原样复制，未做任何修改）。
- 用途：
  - 应用与安装包图标：`apps/desktop/electron-builder.yml` 顶层 `icon` 使用 `huhu-icon-1024.png`，由 electron-builder 生成 ICO / ICNS。
  - 窗口图标：主进程通过 `?asset` 引入 `huhu-icon-512.png`。
  - 界面品牌位：顶栏、关于页使用 `huhu-mark-mono.svg`（CSS mask，随主题文字色），启动页使用 `huhu-logo-light.svg` / `huhu-logo-dark.svg`。
- 横版 logo 的 HUHU 字标由 Geist 字形轮廓化而来（SIL OFL 1.1），许可声明见根目录 `THIRD_PARTY_NOTICES.md` 的“随包字体”一节。
- 需要修改图形时，请回到 `obsidian-huhu` 修改后重新复制，不要在这里直接编辑。
