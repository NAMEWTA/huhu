# #7 H3.1 OpenSSH Ed25519 用户证书配对

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t4x`，本机 `wta-ubuntu` 默认 Core。环境终端 ID、topic 的 Lead 和 manifest 的当前指针均已核对。
- task — `task03.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/task03.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report03.md`
- 执行结果 — `done`，应用侧交付。传输层补丁和真实 OpenSSH 握手由 Lead 验收。
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-user-cert`，基线 `29c3fe32417aa99ad7c4790d3d879218e73cf362`。一个已跟踪文件有差异，两份新增文件为未跟踪。

## 实现

- `HostConfigurations` 在现有 `ModuleCredentials` 认证回调中通过版本校验、按原流程解锁身份文件的私钥，再以同一签名器的规范 SSH 公钥匹配伴随证书。已有加密私钥和口令可用。只有沿用同一端点及版本已保存身份的草稿会配对，新选路径仍按原草稿流程测试裸钥。结果增加可选的 `publicKeyCertificate?: string`，保留原 `privateKey` 和口令。 [host-configurations.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/host-configurations.ts:52)
- 伴随文件固定为该身份路径附加 `-cert.pub`。初次检查确实不存在时沿用裸钥。已有条目须为普通文件，以描述符核对文件和大小，只读取至已知大小加一字节，最大 1 MiB。目录、符号链接（包括悬空链接）和读取失败均走不可读错误。解析核对证书行及 Base64、SSH 字段边界、UserCert 类型和 32 字节 Ed25519 主体。传给 ssh2 的文本保留原证书 blob，去除文件注释。CA 信任、签名授权、principal 和有效期由服务端判定。 [identity-certificate.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/identity-certificate.ts:22)
- `SSH_AUTH_FAILED` 的本机原因分别为 `identity-certificate-unavailable`、`identity-certificate-too-large`、`identity-certificate-invalid`、`identity-certificate-not-user` 和 `identity-certificate-mismatch`。错误、主机目录及 portable 定义没有输出本机路径、口令、证书或证书主体信息。

## 现有连接路径和 Lead 衔接

`dialChain` 的正常和外部对象分支使用 `withManagedAuth`，草稿目标使用 `withDraftAuthentication`。三者共用 `connectHop`，后者通过 `...auth` 将 `publicKeyCertificate` 和 `privateKey` 传给同一 `ssh2.Client`。外部 `PublicSshProbes` 继续先检查权限和绑定路由，不新增本机路径参数。应用侧测试截取了这三种路径的 `Client.connect` 入参。 [Manager](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/manager.ts:411) · [外部对象入口](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/public-probes.ts:251)

基线 ssh2 1.17.0 默认客户端接受 `privateKey`，忽略新属性，会把已配置私钥作为普通 `publickey` 尝试。请与 Lead 的依赖补丁一起集成。补丁须使 `publicKeyCertificate` 指定的证书成为该私钥唯一的 publickey 身份，证书拒绝后不能再尝试同一个裸公钥。应用侧对已有但无效的文件会在调用 Client 前报错。Manager 的通用键盘交互仍按既有配置。 [ssh2 客户端认证入口](https://github.com/mscdex/ssh2/blob/v1.17.0/lib/client.js#L832)

## 验证

Node `24.21.0`、pnpm `12.10.1`，运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/identity-certificate.test.ts`，9 项通过。只用临时 Vault、测试凭据后端和临时生成的 CA、主体密钥。夹具使用 ssh2 签发，证书字段和时间固定，避免常规 Vitest 依赖系统 `ssh-keygen`。包结构和凭据回归覆盖以下行为。 [identity-certificate.test.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/identity-certificate.test.ts)

| 场景 | 结果 |
| --- | --- |
| 加密 Ed25519 私钥、正确配对、续期 | 原私钥、口令及正确的证书 blob 到达认证回调。后续调用读取续期文件。夹具含服务端可拒绝的过期时间及不同 principal，本地配对仍成功。 |
| 认证作用域及旧行为 | 缺少伴随文件和非 Ed25519 私钥走裸钥。改址草稿不继承本机身份，新选未保存路径不扫描证书，陈旧版本先报版本冲突。 |
| 文件和证书错误 | 目录、悬空链接、超限、裸公钥、非法 Base64、截断、尾随数据、损坏的主体列表、主机证书和错配钥给出相应原因。失败不触发拨号回调。 |
| 透传 | 用替身在现有同一 Client 边界观测到正常连接、草稿与外部连接都传入证书及原私钥。该检查没有运行网络握手。 |

三个改动文件的 oxlint、oxfmt 和 `git diff --check` 通过。SSH 插件 `tsc --noEmit` 只报 `apps/engine/src/boot.ts:52` 无法解析既有 `@huhu/herdr-client` 声明。真实 sshd 互操作、证书拒绝后无裸钥回退的线路验证、打包与重型检查本轮未运行。

## 依据和候选文件

- 依据 H05、前序设计及规范的 Ed25519 证书字段布局。 [来源 H05](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/.agents/dev/changes/2026-11-19-issue-7-ssh-module/source.md:96) · [选型报告](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report02.md) · [OpenSSH PROTOCOL.certkeys](https://android.googlesource.com/platform/external/openssh/+/2ee48adb9fc8692e8d6ac679dcc9f35e89ad68f0/PROTOCOL.certkeys#117) · [OpenSSH IdentityFile 文档](https://man.openbsd.org/ssh_config#IdentityFile)
- Motty `v0.4.12` 的解引用提交为 `102228261703d8f22c5eb98b1c500e2a24889dee`，Apache-2.0。参考 `internal/sshconn/certificate.go` 的伴随命名、缺失回退、用户类型检查和签名器匹配方式。代码使用 Huhu 的凭据租约、ssh2 的公钥序列化、自己的有界文件读取和字段解析。无上游源码复制。 [Motty 配对](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/certificate.go) · [许可证](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE)
- 工作树候选 Git blob 校验值按文件顺序为 `b33b208c572ecc1405941b02eb6ab616cdd62b4f`、`8eb0b6fb4e1294fffcd3ff9c343d7b916a294a0d`、`c590d665083f01d888e825d6d4376e0c53f222ea`。 [host-configurations.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/host-configurations.ts) · [identity-certificate.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/identity-certificate.ts) · [identity-certificate.test.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/identity-certificate.test.ts)

## 阻碍与接续

默认 Core 锁所在文件系统只读，`hc get t4x`、`hc get t3p` 及发布后的 `hc send t3p` 均返回 `cannot open core lock`。回告未投递，同号报告已发布到共享根。

## Lead 验收

Lead 核对三个候选 blob。依赖补丁为 `c4281b1c`，应用集成为 `e71f47b0`。把应用与传输的上限统一为 64 KiB。已选择但未保存的本机身份也在桌面草稿配对，外部草稿仍由已授权端点和既有身份限制。真实 OpenSSH 回环服务验证草稿、加密证书登录、命令通道及拒绝后不回退。SSH 类型检查与证书相关 10 项均通过。其余证书类型及主机 CA 另行实施。
