# #7 R04 本机代理程序字节流适配

- terminal_address — `t4x`，本机默认 Core `wta-ubuntu`，Lead `t3p`
- task — `task10.md`
- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-proxy-command`，基线 `18857911f240b7aeb4ede89317f0a9afee733dcc`
- 执行结果 — 本机传输候选已交付，两个授权文件新增，未暂存。宿主路由和设备审批接线由 Lead 集成。

## 合同

- `validateProxyCommand(command: ProxyCommand): void` 供保存使用，同步检查 Linux 绝对程序路径、控制字符、占位符、argv 数量与总字节数。程序路径最多 4096 字节，最多 64 个独立参数，路径和 argv（含 NUL 终止符）合计 ≤ 8 KiB。
- `expandProxyCommand(command, target): { executable: string; arguments: string[] }` 供预览和运行共用。以首跳 `{host,port,user}` 逐槽一次性替换 `%h`、`%p`、`%r`、`%%`，保留空槽、空格和字面标点。主机要求 ASCII DNS 或未加括号、无 zone 的 IP。端口为 1–65535 的整数。账号要求 1–256 字节，允许 Unicode 字母、数字、组合字及固定标点，禁止选项形式的前导连字符。展开结果复核总字节数。两函数均为无进程副作用的纯输入处理。
- `dialProxyCommand(command, target, signal, assertCurrent): Promise<Duplex>` 仅在 Linux 启用。同步检查 `assertCurrent` 紧邻 spawn 和启动交付。用 `spawn` 直启选定文件，`shell:false`、独立进程组、cwd 为 `/`，环境固定 `PATH=/usr/bin:/bin` 和 `LANG=C`。stdin/stdout 组成字节流，stderr 独立丢弃。适配器无替代拨号分支。 [实现](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/proxy-command.ts)
- 启动期上限为 20 秒，也遵守入参 signal 的取消与超时。进程成功 spawn、管道可用并复核批准后即可交付，随后由原 ssh2 Client 进行真实 SSH 握手、验钥和认证。交付时清除启动限时与 signal 订阅，调用方持有活流。流保留前导和二进制字节并遵循背压。写侧结束给程序 1 秒排空尾部输出，之后回收进程组；显式 destroy 立即回收。进程提前退出时也对已登记组执行清理。范围覆盖留在该 Linux 进程组内的子进程。
- `HuhuError` 详情固定为 `{stage:"proxy",reason}`。`timeout` 使用 `SSH_TIMEOUT`，`invalid-configuration`、`unsupported-platform`、`approval-changed`、`spawn-failed`、`process-exited`、`pipe-failed`、`cancelled` 使用 `SSH_DISCONNECTED`。错误数据不包含路径、参数、输出或原生异常。其他平台返回 `unsupported-platform`。

## 已运行验证

- Node 24.21.0 下运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/proxy-command.test.ts`。同一文件最终 16 项，**15 项通过、1 项跳过**，退出 0。真实 Linux 夹具确认无效路径的脱敏启动错误、隔离 cwd/env、二进制往返和 stderr 隔离。真实进程组用例观测关闭流后组长和该组 helper 均停止运行（/proc 消失或处于退出的僵尸态）。内存管道用例覆盖启动前取消、批准变化、超时、迟到 spawn、失去管道、半关闭、退出和最终关闭次数，并确认启动期限在流交接后解除。 [定向 Vitest](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/proxy-command.test.ts)
- 初次本机子进程夹具通过 Node 的进程 stdio 包装未读到预期字节。改用夹具的标准文件描述符 0/1 后，真实管道字节往返通过。TCP 用例绑定固定 `127.0.0.1` 夹具，沙箱返回 `EPERM`，因此单独跳过。该用例只有在确定与本次登记的回环地址和端口一致时才请求连接。
- 本片未读取真实 SSH 环境、未拨外部地址、无远端写入。TCP 回环和 Lead 的真实 SSH 路由、设备审批、来源限制、生命周期和 UI 验收待运行。按任务分工未运行类型检查、其他测试、E2E、全量与打包。

## Lead 接线与来源

- 调用方从受保护设备批准取得具体可执行文件与 argv，绑定首跳及程序文件身份。将读取当前批准与路由版本的同步复核函数传入 `assertCurrent`。适配器在调用边界复核，程序文件审批及文件身份归调用方。结果只交现有首段 SSH Client，调用方在交接后发生取消、失败或最后释放时销毁流。
- 参照 [t5h/report05.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report05.md) 的责任边界和仓库 GitRunner 的负 PID 进程组回收。Motty 固定 `v0.4.12`（`102228261703d8f22c5eb98b1c500e2a24889dee`，Apache-2.0）提供占位符、stdio 和退出行为对照。本片采用行为参考，源码复制量为零。 [GitRunner](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/versioning/src/engine/git.ts) · [Motty ProxyCommand](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/proxycommand.go) · [Motty LICENSE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE) · [Node 进程组](https://nodejs.org/api/child_process.html#optionsdetached)

## 文件 SHA-256

```text
735a41896a968dd9d23c3b57a68f496c8897c6313eeac8b8831daabd01590a29  plugins/ssh/src/engine/proxy-command.ts
5d499a5fc35cc52f6cbce39636ae8327aae82cdff1b1066457075832100efd6c  plugins/ssh/test/proxy-command.test.ts
```

## Core 回告

`hc get t4x` 返回 `cannot open core lock: Read-only file system (os error 30)`。已核对终端环境、topic、manifest、分支和基线。

报告发布后向 `t3p` 执行 `hc send`，同样返回 Core 锁只读，退出码 5。回告未送达，共享报告可读取。
