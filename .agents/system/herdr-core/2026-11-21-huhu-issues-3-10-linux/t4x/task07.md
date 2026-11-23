# #7 H3.1 · Ed25519 主机证书认证规则

- 共享根 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`，本机默认 Core `wta-ubuntu`，Lead `t3p`，terminal_address `t4x`
- 任务 `t4x/task07.md`，报告 `t4x/report07.md`
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-host-cert-policy`，基线 `e5b12ee1459f51674dff6e84bfbbf47ceaf584cf`

按 `dev-build`、`t5h/report02.md` 和已确认 H06/H3.1，实现纯验证逻辑。仅可写 `plugins/ssh/src/engine/host-certificate.ts`、为现有用户证书和主机证书复用的最小 wire 读取器以及两个文件的直接单测（只跑一个新 host-certificate Vitest 文件）。如抽取共用 wire 读取器，可做现有 `identity-certificate.ts` 的最小迁移并保留错误分类和用户证书行为。KnownHosts 管理、Manager/KEX 协商、pnpm patch/lock/清单、前端、装配由 Lead 负责。禁止建立第二套 SSH 客户端或执行链。

接口建议 `export const OPENSSH_ED25519_CERT = "ssh-ed25519-cert-v01@openssh.com"`、`parseEd25519Authority(line: string): Buffer`（只收裸 Ed25519 CA 公钥行，返回规范裸 SSH 公钥 blob）、`verifyHostCertificate(blob: Buffer, host: string, now: Date, trustedAuthorities: readonly Buffer[], revoked: readonly Buffer[]): { ok:true; leafKey:Buffer; authorityKey:Buffer } | { ok:false; reason: ... }`，用精确错误报告际接口。保留完整证书的签名字节，检查有界输入、HostCert 类型、有限且无歧义 principals、和当前逻辑主机准确匹配（不信服务端自报名或代理地址，不解释通配），有效时间 [after,before)，未知 critical option 拒绝，检查叶钥/证书/CA 撤销且以撤销为先。验证实际 Ed25519 CA 签名与先验完全相等的批准 CA 公钥。接受标准 OpenSSH Ed25519 主机证书和 Ed25519 CA，叶公钥供现有 pin 对照。KEX 对本次 exchange hash 的证明由 Lead 在锁定的 ssh2 上完成。明确无 principal 的安全语义，默认拒绝未绑定主机的新签发。其他算法、KRL 文件和已保存 CA 的匹配规则由外层处理。

参考 OpenSSH 固定 `PROTOCOL.certkeys` 的 Debian 上游发行副本 `https://sources.debian.org/src/openssh/1%3A10.0p1-7~bpo12%2B1/PROTOCOL.certkeys`、OpenSSH 作者的 `https://datatracker.ietf.org/doc/html/draft-ietf-sshm-cert-02`（其中 IETF 算法名与 OpenSSH vendor 扩展有区别）和 BSD-3-Clause Go x/crypto 文件 `https://go.googlesource.com/crypto.git/+/729f1e841bcca28c2cd9f4034d6f7672604dbeda/ssh/certs.go`。复用 Node `crypto`／现用 ssh2 裸 Ed25519 的解析验签及项目 wire 构建。证书只用隔离临时新生成的 fixture，不能读用户 known_hosts 或密钥。可用安装的 `ssh-keygen` 在临时目录生成独立测试证书，或使用生成公钥的签名夹具。请覆盖正例、错误 CA、principal、时间、类型、签名格式和撤销，报告边界。单文件定向 Vitest+受影响包类型检查，不运行 E2E/重测试、不写远端、不派发。
