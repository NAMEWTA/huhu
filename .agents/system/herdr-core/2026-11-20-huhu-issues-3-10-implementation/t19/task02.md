# task02.md 修复 #4 W6.0 独立审查发现

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t19
- 身份 — Windows 本机 Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t19`
- 当前任务 — task02.md
- 任务路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/task02.md
- 报告路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report02.md
- Lead 收件 — 回告终稿绝对路径，由外部 Lead 从共享根收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/receipt

## 目标、依赖与验收

基于本 worktree 的 `3804140c6c4da026694e2d798b348f1229848d42` 返工。先读 W6.0、已交报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report01.md` 和独立审查 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report01.md`。

1. 让 Tasks 消费记录的 messageId 能原样通过现行 Markdown 写入与回读，保证丢 ACK 后可使用同一 ID 去重。补固定反例（换行及适用的元数据边界）和正常往返证据。T3.3 的生产 ID 分配与真实落盘仍由消费者任务接入。
2. 用可导出的声明式回执 schema 约束原生暂停问题的 nativeSessionId。用同一组正常和缺原生会话的样本对照运行时与项目 JSON Schema 导出。
3. 保持公共契约根导出的验证类型和 schema 可由桌面/浏览器正常加载。将依赖 Node 的 SHA-256 与持久 ACK 校验放到明确的 Engine-only 导入边界，保留稳定指纹与两端样例。可使用已有包的独立 export 子路径，无需增加依赖。使用候选当前锁定的 Vite 或相同工具比较 Chromium 和 Web 的模块依赖与产物。界面不从客户端确认可信 ACK。

## 读写范围与交付

仅可写 packages/contracts 里 W6.0 schema、执行校验、导出和相关固定样例/测试；允许增加不引入依赖的 package.json export 子路径。根锁、Engine/Renderer 装配及 Tasks 生产代码只读。重用当前回执样例和 Markdown 写入规则。按 dev-build 与 dev-verify 记录测试、类型检查、构建检查、实际提交及后续调用点。客户端代码若涉及新改动，先完成 zh-modern-web-guidance 的 search 与 retrieve。

只使用合成输入和正常通道，不操作真实 Vault、历史或远端。不派发其他代理。按 system-herdr-core 文件协议核对 manifest active 指针和自身 ID，提交本地代码后非覆盖地发布报告文件，然后回告终稿路径。
