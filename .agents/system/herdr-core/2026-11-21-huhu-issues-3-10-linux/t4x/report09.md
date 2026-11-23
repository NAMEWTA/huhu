# #7 主机 CA 策略审查返工

- terminal_address — `t4x`，本机默认 Core `wta-ubuntu`，Lead `t3p`
- task — `task09.md`
- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-ca-policy`，基线 `f80be2f20d58de5a2bc0940cafbc7fe3a1134a6a`
- 执行结果 — 两项 P1 和 CA 批准地址修正已交付。四个授权文件修改，未暂存。 [审查报告](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/report05.md)

## 修正范围

- 适用的 `@revoked` Ed25519 证书规则从有界、完整的 wire 字段读取规范裸叶钥。规则按该公钥身份拒绝续签证书、裸钥及以同一公钥作为 CA 的证书。已有完整证书、裸叶钥、裸 CA 的等值撤销仍有效。在证书结构可提取对应身份时，撤销优先于类型、时间、principal 和 CA 信任。旧撤销证书的有效期和签发者不限制该公钥身份的撤销。匹配仍限定于适用的 host token，其他叶钥、同 CA 的其他签发和其他端口保留独立结果。 [主机证书验证](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/host-certificate.ts)
- CA 验证成功后，普通 pin 通过现有 OpenSSH 范围匹配器生效，包含哈希主机、带否定项的模式列表、通配符和非默认端口。任一适用的可用 pin 与规范裸叶钥相等即可通过 pin 检查。适用 pin 均不匹配时返回 `mismatch` 和去重的记录指纹。无匹配项且有适用的不可解码 pin 时返回 `invalid-host-policy`。普通裸钥的原指纹匹配、列表与移除沿用旧路径。 [策略](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/known-hosts.ts) · [规则解析](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/known-host-rules.ts)
- CA 批准验证独立的地址和 1–65535 整数端口。地址支持 ASCII DNS（含 Punycode 和尾点）、IPv4 与未加括号、无 zone 的 IPv6 原文。端口 22 使用地址本身，其他端口编码为 `[host]:port`。选择器输入中的括号、内嵌端口和非主机模式无法替代所选地址和端口。运行时若历史 marker 规则碰上无效地址编码，返回 `invalid-host-policy`。

## 验证

- Node 24.21.0 上只运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/host-certificate.test.ts`。先把回归加入基线，17 项中 6 项失败，分别是续签撤销、4 种 pin 范围和 CA 地址与端口混淆。修复并加入 CA 公钥身份和截断 wire 对照后重跑同文件，**18 项全通过**，退出 0。
- 使用临时合成公钥和证书。覆盖续签换序列号与 CA、同叶裸钥、其他叶与端口、多条 pin、否定项、默认端口和实际 IPv6 的编码、无效地址不写盘，以及原有本地 `ssh-keygen` 夹具。 [定向测试](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/host-certificate.test.ts)
- 真实 KEX、rekey 可见性、Engine/Web 受保护文件与 UI 由 Lead 收尾。按此任务分工未运行类型检查、E2E、打包或全仓检查。无网络拨号或远端写入。其他算法的证书身份及 KRL 属于本片之外的边界。

## 文件 SHA-256

```text
0380506b7ea57dfe0d1de0b2bcfeb973e16b561d9a082ca22cbe17eefce8d015  plugins/ssh/src/engine/known-hosts.ts
9842ba643aba9afda2d26026f6db1bf55955a4dda050c5b458ea9509886320ee  plugins/ssh/src/engine/known-host-rules.ts
07063dd84fb7b32694efcc199d407904d5023baa9e7856fd1ff0be8e6d373a2b  plugins/ssh/src/engine/host-certificate.ts
a7fe5e9cd5bb7dcf11ded03558044c2b7a0141156e8b478c0e6d07a20f610bdc  plugins/ssh/test/host-certificate.test.ts
```

## Core 回告

`hc get t4x` 返回 `cannot open core lock: Read-only file system (os error 30)`。已核对终端环境、topic、manifest、分支和基线。

报告发布后向 `t3p` 执行 `hc send`，同样返回 Core 锁只读，退出码 5。回告未送达，共享报告可读取。
