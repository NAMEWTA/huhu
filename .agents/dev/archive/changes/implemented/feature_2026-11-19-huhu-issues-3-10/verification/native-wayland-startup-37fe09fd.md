# 原生 Wayland 启动补验

2026-11-23，Ubuntu GNOME 会话15，loginctl确认Type=wayland、Remote=no、State=active；连接本机`/run/user/1000/wayland-0`。使用37fe09fd构建生成的linux-unpacked/huhu，独立HOME/userData/XDG路径，无Vault、旧凭据或原生Agent历史。Playwright固定`--ozone-platform=wayland`，私有D-Bus会话；没有Xvfb或DISPLAY。

HC t1bn首轮因驱动使用了不存在的按钮名“打开 Vault”失败；可访问树已经显示真实启动页。t1bp按实际“打开 Vault 文件夹”修正驱动后退出0。运行采集app.isPackaged=true，版本0.0.1-rc.4、Electron44.9.1、Chromium152.0.7977.167；Wayland协议日志包含xdg_toplevel.configure及wl_compositor交互，启动页可见。关闭的是本次应用，独立目录已清理。

原始记录：`temp/final-audit/native-wayland-startup.json`、`native-wayland-protocol.log`、`native-wayland-startup.log`；首轮失败保留于`native-wayland-startup-selector-red.log`。Lead查看`native-wayland-startup.png`，这是webContents截图，不含合成器原生框架。

本项只证明当前候选能直接在原生Wayland打开启动页；不证明deb安装、原生拖动/缩放/按钮/键盘关闭、系统输入法或Xorg。用户已接手这些外部/手工验收，不记为已通过。
