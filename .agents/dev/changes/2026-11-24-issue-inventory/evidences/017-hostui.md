# HostUI · 约定浮层容器与日期字段的宿主语义

状态：通过（合同样例）。

[实施票据](../tasks/017-hostui.md)

- 版本：提交 `8dd2c3d7`，main `c288103c`。
- 合同：`packages/ui/src/components/host-ui.ts` 以容器与事件传入当前层，沿用原生 modal；日期区分纯日期、UTC 时刻、带时区本地时钟。Inbox 内嵌命令挂最近 dialog，首次 Esc 收菜单回原字段、下一次交外层、IME 组合中保留 Esc；编辑器浮层挂主题作用域或最近 dialog，无日期为 `null`；Automations 绝对时刻保留 UTC，本地时钟保留输入与回拨早/晚，清空为 `null` 并保留时区。
- 单测：`apps/desktop/test/host-ui-contract.test.ts` 4/4；ui、desktop 类型检查 0 错误。真实挂载迁移归 U1。
