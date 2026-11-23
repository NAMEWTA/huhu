# t18d/task03 · XTEST 预检修复

Lead t3p，integration。已修正 task02 夹具的身份检查。原命令可供 Lead 串行重跑。

```bash
bash temp/final-audit/t18d-xtest/run.sh 9350f32bbe014243e4c81546b0ac1aa5afa9e226
```

## t18m 失败位置

旧 helper 尝试在 `/proc/<app.process().pid>/environ` 中逐字节查找夹具的 `DISPLAY=…`。t18m 在第一个字段就退出，尚未连接 X11、设置 X 焦点、放行洪流或发出 XTEST 按键。本轮只有清理和 bridge 附件，Electron 已关闭、Core 已停止、目录已删除。本次失败不提供吞吐数据，日志也没有保存两个 DISPLAY 值或 PID 对照。[运行日志](native-keys-run.log) · [结果 JSON](native-10000-9350f32bbe014243e4c81546b0ac1aa5afa9e226.FNHCVp/result.json)

锁定的 Playwright 1.65 在 Linux 直接启动 Electron 可执行文件，传入夹具指定的环境；`app.process()` 返回该子进程。它通过目标 Page 的 DevTools target ID 找回 main 进程的 BrowserWindow。该路径没有 shell 包装 PID 的代码证据。[启动与环境](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js#L46105) · [进程对象](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js#L46202) · [窗口映射](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js#L46075)

`/proc/<pid>/environ` 读取初始环境内存区。Chromium 的 Linux 进程标题实现可以把环境值迁出该区，再覆盖原区域。在本机用只有合成 DISPLAY 的独立 POSIX 进程复核，改标题前 libc getenv 与 proc 均匹配，改标题后 getenv 仍匹配、proc 已失配。这证实旧判据能误拒正确环境。t18m 的历史数据不足以判定具体是哪一次环境或进程标题变更导致失配。[Linux proc_pid_environ(5)](https://man7.org/linux/man-pages/man5/proc_pid_environ.5.html) · [Chromium 进程标题实现](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/process/set_process_title_linux.cc)

## 新的核对方式

- 使用 `app.browserWindow(page)` 对应的对象，在拥有这个窗口的 Electron 主进程内一次读取原生 XID、PID、进程类型及三个固定环境字段。要求进程类型为 browser、主进程 PID 与 Playwright 启动 PID 相同、XID 有效、DISPLAY 对应夹具本地显示器的默认屏幕、XAUTHORITY 与私有 profile 根路径逐字一致。DISPLAY 等价仅接受夹具的 `:N` 和显式默认屏幕 `:N.0`。身份检查通过后才启动 Python helper，并显式传递刚核对过的三个字段。[主进程预检](t18d-xtest/native-keys.ts)
- 预检日志只记录双方 PID、经过本地显示编号格式筛选的 DISPLAY 与身份检查布尔值。缺失或非本地格式的主进程 DISPLAY 记为 null。授权文件路径、profile 路径与其余环境值均不进入该诊断行。
- helper 仍独立核验私有 Xauthority 所属目录、X11 socket 对端 UID/PID、Xvfb 可执行文件及实际 `-auth` 文件，并要求目标 XID 的 `_NET_WM_PID` 与已核对的 Electron 主进程 PID 完全相同。原生 X 焦点和每键的焦点复核均保留。[X11 窗口与连接检查](t18d-xtest/replay.py)

## 已验证与未运行项

定向 TypeScript 类型检查和 Python 语法检查通过。11 个模拟身份组合在 helper 启动前验证了同显示器、显式屏幕 0、其他显示器与屏幕、DISPLAY 缺失或异常、授权文件不符、profile 不符、PID 不符、进程类型不符及无效 XID。两个合法组合到达后续取消点，九个异常组合均在身份核对处被拒绝。日志净化检查通过。

本轮只修改了临时夹具的 native-keys.ts 和 replay.py，并交付本报告。未启动 Electron、Core、Xvfb 或 XTEST，未运行 E2E、构建或打包。下一次真实运行将首次提供主进程与 Playwright 的 PID、DISPLAY 对照，同时核验 Xvfb peer、窗口归属和真实输入。
