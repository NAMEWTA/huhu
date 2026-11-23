# 首页保存后的查询取消错误

2026-11-23，#10 Linux 定向验收发现：f91a5515 AppImage 在键盘保存后同时显示“布局已保存”和“无法读取首页布局”。原八主题检查没有断言错误提示，t19y 的退出 0 不代表完整视觉验收通过。截图保存在 `temp/final-audit/dashboard-appearance-f91-artifacts/`。

## 红灯与根因

`t1b3` 在原包上增加零 alert 断言后失败，收到 1 条 alert；日志 `temp/final-audit/dashboard-save-red.log`，trace 与错误上下文已另存 `temp/final-audit/dashboard-save-red-artifacts/`。

`useDashboard.wrote` 在成功回执后用 `cancelQueries(..., {revert:false})` 取消旧读取，再设置已提交布局。安装的 TanStack Query 5.107.1 将这种取消在异步 catch 中派发为 error，覆盖已写入的成功状态。采用既有默认 revert 取消：同步恢复读取前状态，再写入提交回执；取消的 catch 返回当前数据，不把主动取消记成读取错误。旧请求已取消，不能再写回过期布局。不改变真实读取失败的提示。

Modern Web Guidance 已搜索 `cancel asynchronous requests` 并完整读取 `js`，日志为 `query-guidance-search.log`、`query-guidance-read.log`。此次适配复用已安装查询库，无新增浏览器 API 或依赖。

## 验证范围

`t1b4`：engine-client 单文件 29 项通过，workbench 类型检查、变更文件 lint/format 通过。`t1b5`：新增 E2E 类型检查、格式与 lint 通过。

新增候选包用例覆盖四主题×明暗、125% 缩放、减少动效、实际 Tab/Shift+Tab/Enter 操作、移动后磁盘坐标，以及重新载入时真实读取失败仍显示错误、恢复后重试读取已保存布局。`accept-linux-candidate.sh dashboard` 固定包字节与提交。安装包复核待执行，尚不能记为通过。

本项由 Lead 实现与复核；既有 HC 审查账号额度耗尽，未声称完成新的独立审查。SSH 未修改，实际读屏、跨平台和其他外部环境缺口沿用交付范围记录。
