# t176/task10 · Core 到浏览器终端洪流定位

Lead `t3p`，worker `t176`，integration。da645ee8 的浏览器 WebSocket 快照尚无尾标，随后独立 Core 读取已见尾标，DOM 行容器保持原节点。优先核对 Core 实时 viewer 到浏览器 WebSocket 的各段，同时保留 Core 晚于截止时间处理尾标的可能。已有证据无法确认瓶颈，本轮保留生产代码。

## 实跑证据

同一会话 `sess-mwsdhadk799u` 的阶段附件是 trace 中的 `attachments/ea257437c255d088079e8939498b15bf1ff6a4b7`。下面时刻均相对 gate 放行。 [t182 日志](flood-stages-da645ee8.log#L108) · [保存的 trace](flood-stages-artifacts-da645ee8/)

| 观察点 | 实际结果 |
| --- | --- |
| 浏览器 WebSocket | 首帧 +26 ms。截止 +20,000 ms 收到 847,308 字节。最后计入的帧在 +20,269 ms，+21,075 ms 快照累计 978,380 字节、161 帧。跨帧匹配无尾标，无关闭事件。 |
| Core `terminal.read` | +21,075 ms 发起、+21,336 ms 完成，`complete: true`，返回 677 字符，包含尾标，末行符合提示符启发式。只能给出 Core 已处理尾标的时间上界。 |
| 页面探针 | 首批行 +171.6 ms，2,805 个窗内可信按键。原行未脱离，替换次数为零，快照仍是初始行容器且无尾标。原 20 秒完整性断言失败。 |

WebSocket 数字是该观察点累计接收的流载荷，PTY 换行处理与 Core 重绘都可改变字节量。差值不能直接当作丢失的源字节。Core 屏幕结果与浏览器快照也并不同步，无法证明 Core 在原 20 秒截止时已经见到尾标。

## 版本与实际协议

da645ee8 和当前 `scripts/herdr.lock.json` 都锁定 Core 0.1.19，工作树 Linux x64 资源旁的 `.herdr-lock` 同版本、同发行归档摘要。本地只读 Core 源码为 `ce81486e3d4032405060bb823687376fadaa087b`，Cargo 版本也是 0.1.19，HEAD 是 11 月 10 日的 macOS launchd 更改，晚于 changelog 的 11 月 7 日发行日期。工作副本中的 Linux x64 可执行文件 SHA-256 为 `d408197a6b85af97b2fe93a10e6f4bee18d3a654307db94df2b35aea277c466f`，没有把它当作源码 commit 或 t182 运行时文件的校验值。Huhu client 和 bridge 相对 da645ee8 无差异。 [Huhu 版本锁](../../scripts/herdr.lock.json) · [Core 包版本](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/Cargo.toml) · [本地 Core 协议](/home/wta/projects/huhu/temp/sources/herdr-core/schema/README.md#L64)

- Core 先把 PTY 输出送入屏幕模型，再独立排入 viewer outbox。超过 4 MiB 待发上限时，outbox 清掉 backlog，viewer 排入以 CAN `0x18` 开头的当前屏重绘。控制帧优先，viewer 每次 DATA 至多 16 KiB，初始 credit 为 256 KiB。累计 847,308 字节超过三倍初始额度，同一连接在运行中必然成功返还过 CREDIT。现有记录里没有 outbox 峰值或重绘标记，仍不能确认溢出。 [Viewer 输出及重绘](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/viewers.rs#L109) · [Outbox](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/wire.rs#L237) · [重绘前缀](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/viewers.rs#L411)
- Huhu client 解码后同步交给订阅者，bridge 在 WebSocket 打开时直接 `ws.send`，随后 client 回报对应的 4 字节 LE CREDIT。只有 bridge 的 `bufferedAmount` 达到 4 MiB 时才延后 CREDIT 并每 50 ms 重试。浏览器收到不到 1 MiB 不能反推服务端从未达到该阈值。Core 的 FOCUS 只影响 viewer 活跃度、尺寸选主及请求了 focus reporting 的程序输入，实时输出排队没有 FOCUS 条件。独立 `terminal.read` 对普通 shell 是读取 Core 屏幕模型。 [Client attach](../../packages/herdr-client/src/client.ts#L213) · [Engine bridge](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L86) · [Core 帧处理](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/server.rs#L394) · [Core FOCUS](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/viewers.rs#L292) · [Core 屏幕读](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/api.rs#L371)

## 下一次取证

1. 先用 0.1.19、私有 HOME/XDG/socket 和 `/bin/sh`，在同一 10 MiB、同一 gate 下直连 `attachTerminal`，即时消费并返还 CREDIT。记录 DATA 字节、初始屏之后的 CAN 重绘签名、跨帧尾标时间和独立 `terminal.read`。如直连也复现且出现重绘，优先调查 Core viewer 排队与调度；把直连数据作为协议路径诊断，保留浏览器原用例作为验收。
2. 直连若及时见尾，再在真实 bridge 同一会话记录 Core DATA 到达、CREDIT 即时和延后字节、`bufferedAmount` 峰值、`ws.send` 及其完成回调的累计字节、错误和尾标时刻，和已有浏览器观察点对时。Core DATA 尾标缺失时查 viewer 侧；bridge 已发尾标而浏览器未观察到时查 WS 传输或观测延迟。保持单终端、原阈值及原负载，记录小计数。

## 变更与实际验证

生产代码和测试均没有留下差异。用 `packages/herdr-client/test/attach.live.test.ts` 的临时隔离诊断试了两次单文件 Vitest。私有 HOME/XDG/socket、固定 PATH `/usr/bin:/bin`，shell 计划为 `/bin/sh`。第一次 `server start` 在 8 秒超时；第二次直接前台 `serve` 在 socket 就绪前报 `Operation not permitted (os error 1)`。两次均未进入 attach 或启动测试 shell，未访问真实历史。已撤回临时测试并核对该文件无 diff。 [两次诊断日志](t176-direct-attach-probe.log)

```sh
PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec vitest run packages/herdr-client/test/attach.live.test.ts -t '隔离终端洪流阶段取证'
```

## 未运行的验证

未取得直连吞吐结果，未执行 E2E、构建、打包或全仓门禁。0.1.19 发行源码精确 commit 与 t182 Core 文件摘要未从现有附件核实。

回告 `hc send t3p` 退出 5，Core lock 所在文件系统在 worker 沙箱内为只读。报告保存在指定工作树路径。
