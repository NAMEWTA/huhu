# 首页保存后的查询取消错误

2026-11-23，#10 Linux 定向验收发现：f91a5515 AppImage 在键盘保存后同时显示“布局已保存”和“无法读取首页布局”。原八主题检查没有断言错误提示，t19y 的退出 0 不代表完整视觉验收通过。截图保存在 `temp/final-audit/dashboard-appearance-f91-artifacts/`。

## 红灯与根因

`t1b3` 在原包上增加零 alert 断言后失败，收到 1 条 alert；日志 `temp/final-audit/dashboard-save-red.log`，trace 与错误上下文已另存 `temp/final-audit/dashboard-save-red-artifacts/`。

`useDashboard.wrote` 在成功回执后用 `cancelQueries(..., {revert:false})` 取消旧读取，再设置已提交布局。安装的 TanStack Query 5.107.1 将这种取消在异步 catch 中派发为 error，覆盖已写入的成功状态。采用既有默认 revert 取消：同步恢复读取前状态，再写入提交回执；取消的 catch 返回当前数据，不把主动取消记成读取错误。旧请求已取消，不能再写回过期布局。不改变真实读取失败的提示。

Modern Web Guidance 已搜索 `cancel asynchronous requests` 并完整读取 `js`，日志为 `query-guidance-search.log`、`query-guidance-read.log`。此次适配复用已安装查询库，无新增浏览器 API 或依赖。

## 验证范围

`t1b4`：engine-client 单文件 29 项通过，workbench 类型检查、变更文件 lint/format 通过。`t1b5`：新增 E2E 类型检查、格式与 lint 通过。

新增候选包用例覆盖四主题×明暗、125% 缩放、减少动效、实际 Tab/Shift+Tab/Enter 操作、移动后磁盘坐标，以及重新载入时真实读取失败仍显示错误、恢复后重试读取已保存布局。`accept-linux-candidate.sh dashboard` 固定包字节与提交。安装包复核结果见下方。

本项由 Lead 实现与复核；既有 HC 审查账号额度耗尽，未声称完成新的独立审查。SSH 未修改，实际读屏、跨平台和其他外部环境缺口沿用交付范围记录。

## 新包与原入口复核

应用提交 `9d96e9022ed2908d4fad21228b4af29411fd4868`，AppImage SHA-256 `d1a9dd6557796bb63b51754e87597fc2714df0c9b80fe4fb11b574caa2f43e7b`；deb `6be11458048c8d074fcb763b5fbf12e3a2c6e2861b6cd772c34db7773cf379db`。t1b6 构建及打包通过。

- t1b7：八主题键盘保存、持久坐标、实际读失败与重试恢复通过。
- t1b8：同一包 close 2 项、Web 1 项通过。没有重跑全部组合组，未影响组仍保留 f91 的原证据，不移植为新包实跑。
- t1b9：截图驱动类型和 lint 通过；t1bb 用同一包复核八主题和视口边界通过，3 组共 4 项，零失败/跳过/flaky/测试外错误。

Playwright 在 Electron 125% zoom 下的页面截图只有 1280×800，裁掉了原生窗口右侧；改用已有 `webContents.capturePage()` 得到完整 1600×1000 截图。边界断言通过；Lead 查看浅色 Claude、深色 Vercel 原生截图，确认右侧完整且保存后无错误。八张截图保存在 `temp/final-audit/dashboard-native-capture-artifacts/`。未因此改动产品 CSS，不声称完成全场景视觉或读屏验收。

原生截图复核时仅此测试文件有未提交驱动变更；诊断 wrapper 限定该路径，仍校验固定应用提交与包哈希。驱动精确哈希、八组边界/坐标及报告哈希见 机器证据（本机原件 `temp/dev/2026-11-19-huhu-issues-3-10/integration/legacy-7984bff4/dashboard-package-9d96e902.json`）。日志为 `dashboard-package-check.log`、`dashboard-close-check.log`、`dashboard-web-check.log`、`dashboard-native-capture.log`（均在 temp/final-audit）。
