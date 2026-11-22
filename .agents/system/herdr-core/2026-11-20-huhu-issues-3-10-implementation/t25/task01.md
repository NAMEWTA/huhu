# task01.md #9 P0.2 模块凭据的版本与替换事务

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t25
- 身份 — Windows 本机 Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t25`
- 当前任务 — task01.md
- 任务路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t25/task01.md
- 报告路径 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t25/report01.md
- Lead 收件 — 回告终稿绝对路径，由外部 Lead 从共享根主动收取。
- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/credentials

## 目标、依赖与验收

按 #9 P0.2、P0.1、相关规格与 t1b/report01.md。实际 Windows 取证优先采用候选 A。交付窄的 Engine 私有合同，要求注入可替换本机保护后端和本机 Vault 实例身份。沿用现有 Vault 写者、同进程串行与加解密原语。定义明确的 keep、replace、clear、删除、版本引用及脱敏状态。验证两个 Vault、插件、实体及用途隔离，同 revision 并发一个成功，崩溃前后、挂起读者、缺钥匙及引用回收。A 的原生依赖、实例登记、Engine 注入和跨平台验证由后续切片接续。

## 读写范围与交付

新增 packages/kernel/src/credentials 中的私有实现及 packages/kernel/test 对应测试。原始报告与夹具只读。不得改 package.json、共享 barrel、根锁、Safe 插件、Engine/Renderer 装配或备份收集器。

阅读原项目的 Change、已交 report 和上游 checkout。按 dev-build、dev-verify 执行。客户端改动先完成 zh-modern-web-guidance 的 search 和 retrieve。相关原型体验仍待确认。只在授权目录内使用临时 Vault、合成数据及正常认证验证。保护真实数据和历史。GitHub 只读，不派发其他代理。交本地提交、检查输出和未测范围。

按指定的 system-herdr-core 文件协议核对身份和 manifest 指针。确认 active 且终稿路径不存在后开始。报告先写同目录临时稿，再用不覆盖的方式发布，随后回告路径。
