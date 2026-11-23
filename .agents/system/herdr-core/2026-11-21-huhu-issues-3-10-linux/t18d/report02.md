# 停键时间与终端输出恢复 · t18d/task02

Lead t3p，worker t18d，只读诊断完成。实验使用同一应用构建 `9350f32bbe014243e4c81546b0ac1aa5afa9e226`。以下 5 秒、10 秒结果均来自 Lead 已运行的诊断变体。每个停键点各一次。[任务文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t18d/task02.md)

**写入和显示恢复的时间随停键点移动。10 秒轮整段 CREDIT 拒绝次数为 0，仍复现超过 10 秒的服务端写回调平台。** 5 秒与 10 秒两轮中，bridge 都在 +0.4 s 前收到并提交了完整尾标。这排除了 Herdr 延迟生产尾标以及 50 ms CREDIT 重试作为两轮共同的必要原因。当前可定位到持续输入期间，已提交 WS 数据的写完成和终端显示均出现延迟。CDP 逐键派发、产品搜索输入处理、Chromium 接收或渲染调度的各自贡献仍待区分。

## 同一零点的读数

时间从各自 gate 放行起算，单位 ms。服务端回调是 Node socket 写完成，CDP 到达时间取测试进程收到事件时的墙钟。bridge 总量从 attach 开始，浏览器从 gate 开始观察。

| 观测 | 5 秒停键 | 10 秒停键 | 原始 20 秒密集输入 |
| --- | ---: | ---: | ---: |
| 最后可信 keydown | 4,999.2 | 9,998.4 | 19,995.9 |
| bridge 收到尾标并调用 ws.send | 322 | 362 | 20,103 |
| 平台上的已回调字节 / 最后回调时刻 | 6,761,643 / 202 | 7,253,894 / 229 | 3,548,999 / 223 |
| 尾标写完成 | 5,196 | 10,795 | 20,996 |
| 最后 keydown 至尾标写完成 | 196.8 | 796.6 | 1,000.1 |
| CDP 观察到尾标 | 5,689 | 11,468 | 截至 +20,840 未见 |
| DOM 尾标 | 5,611.3 | 11,239.2 | 截止未见 |
| 最大 bufferedAmount，B / CREDIT 拒绝次数 | 4,349,462 / 5,916 | 3,860,601 / **0** | 4,447,404 / 86,286 |
| 派键 / 窗内有效样本 / 双 rAF p95 | 775 / 757 / 32.6 ms | 1,461 / 1,456 / 33.1 ms | 2,982 / 2,972 / 32.7 ms（复算） |

两份 JSON 报告内嵌的阶段、关停、按键、清理附件均已对照独立文件。5 秒和 10 秒轮各有一条匹配连接、零诊断记录淘汰、原行容器保留，均在截止前观察到尾标和 11,102,595 B 浏览器二进制负载，清理成功。这两个诊断变体通过其断言，完整持续派键的正式门禁仍待通过。9350 原始轮的 trace 已被后续插件测试覆盖；报告只使用保全的阶段和结果 JSON。[5 秒阶段](stop-keys-5000-artifacts/terminal-flood-stages.json) · [5 秒按键](stop-keys-5000-artifacts/terminal-flood-keys.json) · [10 秒阶段](stop-keys-10000-artifacts/terminal-flood-stages.json) · [10 秒按键](stop-keys-10000-artifacts/terminal-flood-keys.json) · [20 秒原始运行](flood-bridge-artifacts-9350f32b/result.json)

- 5 秒轮在 +322 ms 已提交全部 11,103,049 B，2,185 帧已完成写回调，至 +4,345 ms 的快照计数相同。当时存在 4,341,406 B 已提交但未回调。+5,196 ms 完成全部 4,515 帧。
- 10 秒轮在 +362 ms 已提交同量字节，已完成 2,634 帧。下一条进度事件在 +10,502 ms，恰好是第 2,635 帧的成功回调，此后 +10,795 ms 完成全部 6,028 帧。这直接证明该连接在 +229 到 +10,502 ms 间没有新的成功写回调。进度日志由事件驱动，间隔内没有秒级心跳；期间内核可能继续传输同批数据。
- 两轮中 CDP 最终报告尾标都迟于 DOM 看到尾标，分别约 78 和 229 ms。测试进程的 WS 时间存在可观测滞后。服务端写回调同样有长平台，足以排除单纯晚报 DOM 或 CDP 事件对整个现象的解释。[5 秒关停](stop-keys-5000-artifacts/terminal-flood-bridge.json) · [10 秒关停](stop-keys-10000-artifacts/terminal-flood-bridge.json)

## 下一项对照已备好

在 integration 中由 Lead 运行下列命令。该命令复用隔离的 HOME、DBus、Xvfb、固定 provider 和重型验证锁。它只发现一个临时诊断用例，并将此次日志、含按键和阶段附件的 result.json、Playwright 产物写入新的 `temp/final-audit/native-10000-<SHA>.<随机后缀>/`，开头打印目录。正式用例及配置没有编辑。[运行入口](t18d-xtest/run.sh) · [临时用例](t18d-xtest/native.spec.ts)

```bash
bash temp/final-audit/t18d-xtest/run.sh 9350f32bbe014243e4c81546b0ac1aa5afa9e226
```

对照臂是已保存的 10 秒 CDP 运行。XTEST 臂按 1,461 个已记录 keydown 相对于 gate 的偏移回放同样的 a / Backspace 顺序。参考间隔中位数 6.4 ms、p95 9.9 ms。放行前完成 X11 连接和焦点核对；窗内无逐键 Playwright 调用。两臂保留同一浏览器 WS 观察、搜索框、可信输入与值变化、10 MiB 满速管道、双 rAF 采样、20 秒可见尾标、至少 10 个样本、严格 p95 ≤100 ms 及关停。按原停键变体，先见尾标则提前结束派键。新增核对要求已发 XTEST 键数与目标搜索框可信键数逐条吻合，密度统计写到日志。[Node 控制](t18d-xtest/native-keys.ts) · [XTEST 回放](t18d-xtest/replay.py)

XTEST 本身按 X 输入焦点路由。此处从同一个 Playwright Page 取得所属 BrowserWindow 的原生 XID 和已启动 Electron 的 PID。helper 在连接前核验私有临时目录和 Xauthority，然后通过 Unix socket 对端凭证核实同 UID 的 Xvfb 可执行文件、display 和 `-auth` 文件，核对 Electron 进程的显示环境及目标 XID 的 `_NET_WM_PID`。只在这台隔离服务器上、gate 前将焦点置于该 XID；随后再检验 DOM 搜索框实际拥有焦点。每一键都在短暂持有 X server grab 时重新核对 X 焦点并派发按下/抬起；焦点不符即结束。未使用标题搜索、鼠标位置或系统默认显示器。helper 还受父进程管道、夹具取消和超时约束。使用的是本机已有 libX11/libXtst 与 xprop。

## 如何判读

先看“XTEST 实收键密度”。10 秒 CDP 对照逐秒键数为 `125, 158, 162, 152, 150, 138, 145, 144, 140, 147`。若 XTEST 早见尾标，只比较双方仍在发键的共同时间段。先核对焦点、可信 input、值变化、实际键数与间隔；明显减载、键被丢弃或预检失败时，不能把结果归因于派键来源。

- 若相同实收密度下 XTEST **在持续输入时**已经完成服务端发送并显示尾标，逐键 CDP 驱动路径对问题有贡献。可交错复测 CDP/XTEST 确认稳定性；这次对照涵盖整条派键路径，不能单凭一次结果指定某条 CDP 消息或追踪功能为原因。
- 若 XTEST 也保持写完成平台并在停键后排空，逐键 CDP 调用并非必要条件。下一步在两臂等量补页面内的 WS message 字节与 xterm.write 完成字节分桶、尾标时刻。WS 到达先慢则查接收任务和 TCP 队列，WS 已到而解析落后则查 xterm 和主线程。两臂仍开着 CDP Network 观察，其共同开销需另作单变量对照。
- 若仅 Node 侧 CDP 计数落后而 DOM 和写完成均正常，则属于观测延迟。诊断数据不能替代原完整 20 秒密集输入用例。

## 验证范围

已离线复算两轮附件，做了诊断用例定向 TypeScript 类型检查、Python 语法及 11 个 X11/XTEST 绑定符号检查、shell 语法检查。Playwright `--list` 仅发现预期的一个用例。**本轮没有启动 Xvfb、Electron、Core 或 XTEST 输入，没有执行 E2E、构建或打包。** 目标窗口 PID 属性、X 焦点及实际回放节拍尚待 Lead 的隔离运行确认。
