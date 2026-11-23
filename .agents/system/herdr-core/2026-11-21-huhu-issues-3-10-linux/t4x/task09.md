# #7 主机 CA 策略审查返工

共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Core wta-ubuntu，Lead t3p，执行 t4x。读取本任务和 t4t/report05.md，写 t4x/report09.md。
工作树 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，分支 impl/huhu-issues-3-10-h7-ca-policy，基线 f80be2f2。按 dev-build 修正两项 P1 和选定主机地址无歧义编码。只写 plugins/ssh/src/engine/known-hosts.ts、known-host-rules.ts、host-certificate.ts 及 plugins/ssh/test/host-certificate.test.ts。Lead 处理 manager rekey 可见性、Engine/Web 受保护文件和 UI，因此不要写其它文件。
复用本仓规则解析和锁定的 OpenSSH 语义。适用的 @revoked 证书按解析出的叶公钥身份匹配续签证书或裸钥，并保留全证书、叶公钥、签发公钥及范围边界。已有普通 pin 的 hash、含否定列表或适用通配符和非标准端口也约束叶钥；保留多条可用信任 pin 的语义以及其他裸主机工作台行为。CA 批准使用合法 literal DNS/IP（含真实 IPv6）和实际端口，不让输入别名借括号或端口改变范围。用现有合成夹具，无外网或未经授权主机。只跑新改动的一个 Vitest 文件 plugins/ssh/test/host-certificate.test.ts 对前后行为校验。按当前 worker 规则，无 E2E、无打包、无全仓检查、无远端写入。报告注明路径、测试、未验收块。报告生成后告知 Lead。
