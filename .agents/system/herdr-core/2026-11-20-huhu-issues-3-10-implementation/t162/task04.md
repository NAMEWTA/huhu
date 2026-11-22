# #7 H2.4 外部 SSH 主机配置的只读预览

终端 t162，任务 task04.md，报告 report04.md。维护本地 `safe-personal` worktree 上的新分支 `impl/huhu-issues-3-10-ssh-import`（基线 `891c20e`）。阅读 H2.4、#7 规格、现有 hosts 封装和本地 Motty 已检出的 sessionimport／sshconfig 及许可证。做独立可验收的只读解析与预览层，使用用户提供的文本或字节，附来源、有效记录、冲突与跳过原因。以 OpenSSH、PuTTY、Xshell、MobaXterm、WindTerm、Electerm、Netcatty、SecureCRT 八种合成格式为目标；记录每种实际覆盖的样本变体及未支持的字段。可先交独立可复验的可靠子集，保留其余格式阻断证据，勿把占位解析当作支持。

只处理普通主机配置迁入现有 SSH 主机目录。命令字段只按数据提示，不执行。密钥和口令可提示需重新配置，无解密、读取真实账户、扫描机器文件或联网的需求。预览没有 Vault 写入、进程启动和网络副作用。接口优先复用既有 SSH 主机输入结构，尽量复用许可清楚的本地源码，逐一记录文件、提交、许可证和实际差异。准许写 SSH 插件后端、其测试和 H2.4 文档，公共契约、共享现有锁与依赖新增、Engine/Renderer 装配、插件 manifest 或全局来源台账交 Lead。当前仅 Windows 的固定 pnpm 自动化，禁用自动依赖核验，无 GUI、安装包、其他 OS 或远端操作。完成精确提交、报告测试证据及下一步确认写入入口。用完验证子 pane 回收。
