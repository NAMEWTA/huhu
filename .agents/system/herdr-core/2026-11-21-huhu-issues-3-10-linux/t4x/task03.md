# #7 H3.1 OpenSSH Ed25519 用户证书

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 本机默认 Core `wta-ubuntu`，Lead `t3p`，当前实施终端 `t4x`
- 任务 `t4x/task03.md`，报告 `t4x/report03.md`
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-user-cert`，基线 `29c3fe32417aa99ad7c4790d3d879218e73cf362`

按 `dev-build` 实现 #7 来源 H05 的 OpenSSH 用户证书配对。参考 `t5h/report02.md` 与 Motty v0.4.12 的 `internal/sshconn/certificate.go`。仅对现有本机选定的 Ed25519 身份文件，在原 `ModuleCredentials` lease 和 revision 校验内读取同路径 `-cert.pub`。确实不存在时沿用旧裸钥行为。文件存在但不可读、超限、无效、证书类型不是 UserCert 或与私钥的规范公钥不匹配时，给出区分的本机认证错误。使用有界的普通文件读和结构化 OpenSSH 字段解析；基于已经解锁的 private key，允许现有加密私钥。保留路径、口令、公钥证书原文、主体信息在认证调用内部。不要为本切片增加导入任意路径、外部参数、UI 或主机 CA，也不要增加第二套 SSH 连接。

Lead 负责依赖补丁。认证参数在现有 `ConnectionAuth` 上增加可选的 `publicKeyCertificate?: string`，保持 `privateKey` 为原签名材料，并把证书文本传给同一个 ssh2 Client。应用层只验证结构与主体配对，用户证书的信任链、principal 和时效由服务端判定。请核对 Manager 现有正常连接、草稿以及外部对象是否已经透传；如端点认证会降级尝试裸钥，修正本方案的透传或报告明确由 Lead 衔接。既有归属和路由授权不可削弱。

可写 `plugins/ssh/src/engine/host-configurations.ts` 及本片新建的同目录解析文件、一个本片 Vitest 文件。Manager、公开契约、依赖、根锁、注入、清单和证据文件由 Lead 管理。可运行本片一个 Vitest 文件，使用隔离的本机路径和临时生成 Ed25519 CA/subject 测试夹具；如果标准 `/usr/bin/ssh-keygen` 不适合常规测试环境，给出确定性的测试态证书 fixture 或由 Lead 独立跑真实服务。勿读取真实身份文件或历史。仅 Lead 运行真实 OpenSSH 互操作、打包和重型验证。报告列出未运行项与候选 diff 或 SHA，不写远端，不派发。核对 Core 的 task/manifest 当前身份后开工。
