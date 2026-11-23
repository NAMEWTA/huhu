# #7 H3.1 · Ed25519 主机证书认证规则

- terminal_address — `t4x`，本机默认 Core `wta-ubuntu`，Lead `t3p`
- task — `task07.md`
- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-host-cert-policy`，基线 `e5b12ee1459f51674dff6e84bfbbf47ceaf584cf`
- 执行结果 — 纯验证候选已交付，一项修改、三项新增，未暂存。KEX 与 KnownHosts 接线由 Lead 集成。

## 行为与接口

- `OPENSSH_ED25519_CERT` 采用 OpenSSH vendor 算法名。`parseEd25519Authority(line)` 从单行裸 `ssh-ed25519` 公钥文本返回规范 SSH blob，接受注释和单行结尾。错误抛出无原文的 `INVALID_INPUT`。
- `verifyHostCertificate(blob, host, now, trustedAuthorities, revoked)` 接收本跳原始证书 blob、不带端口的逻辑主机及由外层筛选的批准、撤销记录。成功返回规范裸 `leafKey` 与 `authorityKey`。大小上限 64 KiB。依序发现完整证书、裸叶钥或签发钥命中撤销时立即返回 `revoked`，优先于后续证书类型、principal、时间、CA 信任和验签判断。
- 仅接受 HostCert 类型。principal 最多 256 个，每项最多 255 字节，要求严格 UTF-8、无重复、无空项，以原样字符串匹配逻辑主机。域名保留大小写和尾点，IPv6 以原始不带方括号的地址文字传入。空列表返回 `no-principals`，带通配符的列表返回 `invalid-principals`。时间使用 uint64 秒级半开区间 `[validAfter, validBefore)`。主机 critical options 要求为空，格式正确的未知非关键扩展可忽略。
- 签发钥必须为规范裸 Ed25519，且与已批准 CA blob 完全相等。使用 Node Crypto Ed25519 对原 blob 从算法至 CA key 字段末尾的原始字节验签。验签检查签名算法、64 字节签名和内外报文边界。与失败原因 `revoked`、`untrusted-ca`、`invalid-signature` 等一起返回的只有稳定代码。 [主机证书验证](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/host-certificate.ts)
- 抽取 SSH 字段读取器，用户证书只切换读取器，保留原配对逻辑和 `SSH_AUTH_FAILED` 分类。 [SSH 字段读取器](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/ssh-wire.ts) · [身份伴随证书](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/identity-certificate.ts)

## 源码与证据

- 核对 OpenSSH 10.0p1 固定发行副本的 vendor wire 格式、时间字段、签名数据范围及扩展语义。IETF 草案的算法名称用于概念对照。核对固定 Go x/crypto `729f1e841bcca28c2cd9f4034d6f7672604dbeda` 的 principal 与验签职责（BSD-3-Clause）。本片自行实现调用约定，未复制上游源码。 [OpenSSH PROTOCOL.certkeys](https://sources.debian.org/src/openssh/1%3A10.0p1-7~bpo12%2B1/PROTOCOL.certkeys) · [IETF 草案](https://datatracker.ietf.org/doc/html/draft-ietf-sshm-cert-02) · [Go 固定版本](https://go.googlesource.com/crypto.git/+/729f1e841bcca28c2cd9f4034d6f7672604dbeda/ssh/certs.go)
- Node 24.21.0 下运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/host-certificate.test.ts`，最终 1 文件、8 项全通过。包含临时目录中由 `ssh-keygen` 独立生成的 CA、主机钥及签发证书，验证域名和 IPv6，回读两把规范裸钥。Node 生成的签名夹具覆盖原始签名区、错误批准 CA、错误签发私钥、principal 限制、有效期边界、类型、critical option、线格式、三种撤销和用户证书错误分类。首次运行的子进程管道触发 `EPERM`，改为 `stdio: "ignore"` 后同文件通过。仅接触临时合成证书和公钥。 [定向 Vitest](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/host-certificate.test.ts)
- `pnpm --config.verifyDepsBeforeRun=false exec tsc --noEmit -p plugins/ssh/tsconfig.json` 退出 0。
- KEX 当前交换哈希的签名、rekey、已存 CA 模式与端口、既有 pin、逐跳运行和 UI 等由 Lead 接线与验收。按任务范围未运行 E2E、独立旧用户证书套件、全量或重型验证。

## 文件 SHA-256

```text
9fed175da47d2d1373c88ba6800da455abd4035a2554ca4a12edb47652348bfb  plugins/ssh/src/engine/host-certificate.ts
9bc90b7f2c8c6413b3599f034d8509d5ae77f5d7de45512c2750ba57a4210573  plugins/ssh/src/engine/ssh-wire.ts
fc3852244e963d02e376e6a1f2ba3d3523516cf61a02ab4d6ce0eba9aaf6464d  plugins/ssh/src/engine/identity-certificate.ts
f428d209b7f98f48a30da8de42e9f3c085e9219de169d4c864fa36bee36d7c54  plugins/ssh/test/host-certificate.test.ts
```

## Core 回告

`hc get t4x` 返回 `cannot open core lock: Read-only file system (os error 30)`。已核对终端环境、topic、manifest、分支和基线。

报告发布后向 `t3p` 执行 `hc send`，同样返回 Core 锁只读，退出码 5。回告未送达，共享报告可读取。

## Lead 验收

纯验证候选归档 `ec654d56`，与 KnownHosts 规则、桌面管理和 ssh2 KEX 合入 `84d19cb8`。真实 OpenSSH 10.2p1 回环用批准 CA 完成连接，重协商后原连接输出 128 KiB。错误 CA、撤销叶钥在用户认证前拒绝。证书和管理回归 22 项、管理器回归 23 项定向通过，SSH 与 Engine 类型通过。独立审查和实际工作台 CA 操作待复验。
