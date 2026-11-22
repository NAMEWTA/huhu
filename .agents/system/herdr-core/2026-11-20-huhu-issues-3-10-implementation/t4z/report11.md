# #4 Windows Agent 一代切换与输入归属独立复核

- terminal_address — t4z
- task — task11.md
- Core — Windows 本机 wta，`346bd5608735e3fcb27f9d01f5c8008e`，0.1.21。清单指向 `t4z → task11.md → active`。
- 执行结果 — done（两项生命周期阻断已复验关闭，建议签收冻结私有切片）
- 冻结序列 — `4fe97901d7952709f1371432bb0327ef0bdaf958 → ba5f348160b05826dd54f4eaa162f20a9a3fd25d → ec581b3276541a7660a69bb2f50a551545ec0689`，均为直接父子。

## 签收建议

**W1.2 可签收。** 插件停用与重新启用后，同请求能找回唯一的真实进程。旧请求不可覆盖其持久 attempt 或终端地址。

**W6.1 私有发送切片可签收。** 停用前未送出的正文保持零次写入；已经送入 Core 的正文可跨代对账，实际只收到一次。生产 provider ACK 与 Tasks 组合装配继续待验收。两项判断均以最终冻结提交的独立复跑为准。 [report08 原阻断](report08.md) · [t12d 返工交付](../t12d/report01.md) · [本轮独立日志](evidence-task11/independent.log)

## 规格轴

| report08 阻断与相邻场景 | 本轮 Windows Core 实测 |
| --- | --- |
| **W1.2 · Core run 前停用** | 真实 `PluginManager` 停用旧作用域，再启用并重传同一启动。旧请求返回可重试的 `PLUGIN_DISABLED`。新请求和第三次重查均返回同一个 session，持久地址均为 `t5`。真实 Core 同标签仅 `t5 / PID 20396`，持久 attempt 与终端代次标签一致。 |
| **W1.2 · Core run 后迟到回包** | 已启动后延迟回包再切换作用域，旧请求返回 `RUN_UNKNOWN`，下一代找回原进程。第三次重查仍成功。Core 同标签仅 `t6 / PID 34332`，持久地址与原 attempt 均保留。协议夹具中的两个活动服务争用同键也只提交一次 `terminal.run`。 |
| **W1.2 · 持久记录和原负例** | 同一 launch 的会话 JSON 截断或移除均返回 `RUN_UNKNOWN`，独立查询只列原 `t3 / PID 50824`。Junction 消失后保留 `t4`，改向得到 `IDEMPOTENCY_MISMATCH`。缺生命周期字段、无法判定及地址重用继续拒绝认领；只有已证实未创建才沿原请求续发。 |
| **W6.1 · Provider 就绪前停用** | 就绪信号明确取消，旧请求返回可重试的 `PLUGIN_DISABLED`。实际 provider 输入计数为 0。持久记录为 `not_sent`，无执行绑定且无 owner。重新启用后沿用原网关幂等键和原 dispatchId，provider 实际收到一条。 |
| **W6.1 · 最终进程核验期间停用** | 人工在发送权领取前可取得控制。停用关闭旧人工窗口，旧桥重新接入失败。持久记录仍为 `not_sent` 且无 owner，正文写入为 0。 |
| **W6.1 · 发送后停用、回包丢失** | 真正的 Core 写入已发生，旧代停在回包边界。持久 `sending` 带有效 owner；切换后以原派遣对账得到 `coreWrite: unknown` 并保留 owner。竞争任务 busy，人工仅观察，评审发送被拒。匹配同一执行及正文摘要的合成 provider 收件证据到达后得到 `accepted`，Core 写回包状态仍为 unknown。释放旧回包后，最终凭据保持原执行，原请求输入计数 1，竞争任务 0。 |

上述场景均来自本次冻结夹具的直接日志。复核了夹具对持久 session、attempt、发送意图、owner 和收件证据的断言。两项历史红灯使用 t12d 和 report08 的留存证据。 [本轮验证](evidence-task11/independent.log) · [W1.2 父版红灯](../t12d/evidence-task01/w12-red.log) · [W6.1 父版红灯](../t12d/evidence-task01/w61-red.log)

## 规范轴与证据边界

- 插件作用域以同一生命周期信号撤销旧客户端与请求。W1.2 在连接后重读持久原请求，在单个同步步骤中领取 attempt、落盘并提交启动。晚返回写回再核对当前 attempt，阻止已停用的作用域覆盖。核对 `ec581b3:plugins/agent-cli/src/engine/index.ts:62–89`、`sessions.ts:441–509`。
- W6.1 最终核验真实进程后，在发出 RPC 的同一同步步骤检查派遣记录、取得输入归属并写入发送意图。停用保留已提交意图，下一代只能按原归属继续查证。旧终端桥丢弃排队输入并关闭连接。核对 `ec581b3:plugins/agent-cli/src/engine/dispatch.ts:178–202,215–244`、`sessions.ts:640–660`、`terminal-bridge.ts:55–86`。
- 实跑覆盖锁定 Core、实际 PluginManager/Dispatcher、合成 Vault 和合成 provider。发出 Core RPC 与 provider 收件是分别取得的事实，Core 0.1.19 的绑定检查与发送仍为两个 RPC。生产 provider ACK、实际 Tasks 权限与执行器接线、外部 hc 的输入及原生 resume 留待 Lead 验收。

## 运行和清理

Windows x64 build 26300，Node 24.21.0，Vitest 3.2.7，Core 0.1.19。exe SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。复用 t12d 冻结脚本的环境方法，用独立 Git 归档复跑同一组 8 文件，**91 通过、6 条件跳过**，Vitest 退出 0。工作区包来自冻结树；第三方依赖只读复用 `3461045` 的本机安装，对应锁差异为 CLI `tsx` 和无关的 native keyring 条目。冻结差异检查通过。 [冻结脚本](evidence-task11/frozen.ps1) · [独立回归日志](evidence-task11/independent.log)

临时验证命令已退出，归档已删除，两个隔离 Core 管道均复查为退出码 5 / os error 2。夹具确认隔离 Core、holder 与七个合成 provider 进程已退出。本次无需另开 Core 窗格。 [清理记录](evidence-task11/cleanup.log)
