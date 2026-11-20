# W04-09 恢复默认布局

Windows、pnpm 12.10.1、随项目锁定的 Electron 44.9.1。使用临时 Vault 中带标题及自定义坐标的专注卡、已停用的 Tasks 插件，走工作台的首页编辑入口。

- 打开确认后按 Esc，焦点返回恢复默认按钮，自定义卡仍显示。
- 确认恢复后，草稿显示允许使用的三张默认卡。取消编辑前后，已提交文件的字节均与原件一致。
- 再次恢复并保存，重新加载工作台后默认卡可见。磁盘记录具有新 revision，保存的实例包含概览、最近笔记和专注。

[用户确认](../prototype-review.md) · [任务与验收条件](../tasks/W04-09-reset-defaults.md) · [Electron 回归](../../../../../tests/e2e/workflows/acceptance.spec.ts) · [运行日志](/D:/Document/code/huhu/temp/issue-baseline/dashboard-reset.log)
