# 审查 Windows 原生 PTY 受保护交付

- terminal_address `t187`
- 只读原生候选 `f4f68fd3`（前序 `cfcea984`）
- 新一轮报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report10.md`

请在 Lead 接线期间先复核固定 Go 源码和实现者提供的两轮 Windows 证据。重点是实际 DLL/映像／目录固定的核验点、双向 PID 与创建时间核对、匿名 stdin 与命名管道范围、消费和运行回执能否被公开终端伪造、进程清理、字符串/输出遮蔽以及失败和重开后不交付到替换对象。可以使用临时目录和本机合成测试；优先复用 native/agent-pty/verify.ps1。不要改业务代码、工作树、真实 provider 凭据或远端。真实 Pi 已有历史独立证据，允许继续全新的全本机离线临时 HOME。报告逐项引用固定对象、工具版本和观察到的结果。

