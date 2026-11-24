# #7 CLI 自启动 Engine 的凭据与 SSH Exec 保活

基线为 `5021f54c`，运行环境为 Linux x64、Node 24.21.0、pnpm 12.10.1。测试使用临时 Vault、临时 HOME、XDG 配置和运行目录、独立 D-Bus 会话中的真实 GNOME Secret Service，以及仅监听回环的合成 SSH 目标。

## 目录与信任边界

Electron 44.9.1 的 Linux 已打包应用在指定绝对 `XDG_CONFIG_HOME` 后实际创建了 `@huhu/desktop`。该名称来自打包清单 `name`。`productName` 如果出现在应用清单中则优先。CLI 只在创建 Engine 子进程时传入该数据目录。它采用 Electron 文档中的平台位置，Linux 为 XDG 配置目录或 `~/.config`，macOS 为 `~/Library/Application Support`，Windows 为 `APPDATA`。调用本机 CLI 的受信进程可以沿用已有的 `HUHU_DESKTOP_USER_DATA` 指定自定义配置目录。 [应用名称选择](https://github.com/electron/electron/blob/v44.9.1/lib/browser/init.ts#L117-L127) · [应用数据目录](https://www.electronjs.org/docs/latest/api/app/#appgetpathname)

Engine 仍在启动时验证目录的绝对路径、真实路径、与 Vault 的分离以及现有模块凭据目录的文件类型。HTTP、MCP 和 Renderer 的请求始终经过已启动的 Engine。用真实 CLI 带 `desktopUserData` 字段提交 SSH 作业，得到 `INVALID_INPUT`。桌面 Engine 已运行时，CLI 读同一 PID 的端点并完成调用。

## 两处回归

1. 用桌面式 `boot` 保存托管密码和网关选择，关闭后运行实际 CLI，新的 Engine PID 用同一把模块密钥完成密码认证。基线在首个连接进入 `failed`。使用构建后的 CLI 与 Engine 时，默认分支和锁定 Safe 分支各认证一次、发送一次 Exec，读取同样的 stdout，并以退出码 0 结束。 [基线红灯](/tmp/huhu-t10-task02.RTPHOO/test.log) · [构建产物运行](/tmp/huhu-t10-task02.AQR6PM/test.log)
2. 仅修目录时，用 1.5 秒空闲阈值运行已接收的静默 Exec。停止轮询后，Engine 写者端点消失。加入保活后，放行合成远端前 3.25 秒内没有 HTTP 调用，原 PID 和连接仍在。远端关闭后等待 1.1 秒且继续观察到原 PID，随后读到退出码和输出，再停止请求后 Engine 清除端点。现有 SSH 回归中并行取消和主动关闭重开均通过。 [仅修目录的红灯](/tmp/huhu-t10-task02.MBUmwt/test.log) · [修复后的回归](/tmp/huhu-t10-task02.BY6C7Q/test.log)

保活由每个 Engine 实例拥有。SSH 为已持久受理的作业从接收阶段开始持有登记，直到终态处理、取消完成或插件停用时释放。最后一次释放计入空闲时间。登记跟随当前 Vault 的 SSH 插件作用域，由 Engine 私下绑定。SIGTERM、IPC shutdown 和显式关闭沿用已有清理流程。

## 复跑

设置临时 `HOME`、`XDG_CONFIG_HOME`、`XDG_DATA_HOME` 和 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。在独立的 `dbus-run-session` 中用合成口令解锁 `gnome-keyring-daemon --unlock --components=secrets`。本次容器的默认会话总线在查询 AppArmor 策略时报只读错误，因此仅在该私有测试总线的临时配置中使用 `<apparmor mode="disabled"/>`。用 `secret-tool` 的合成项写入、回读及删除检验隔离服务。 [D-Bus 探针](/tmp/huhu-t10-task02.jzk2Zo/test.log)

```bash
export HUHU_HEADLESS_SECRET_SERVICE_TEST=1
export HUHU_CLI_TEST_BUNDLE="$PWD/apps/cli/dist/cli.mjs"
pnpm exec vitest run --maxWorkers=3 \
  apps/cli/test/headless-engine.test.ts apps/cli/test/cli.test.ts \
  apps/engine/test/module-credential-host.test.ts plugins/ssh/test/public-resources.engine.test.ts

HUHU_ENGINE_ENTRY="$PWD/apps/desktop/out/main/engine.js" \
  pnpm exec vitest run apps/cli/test/headless-engine.test.ts
```

| 文件 | 通过 | 失败 | 跳过 |
| --- | ---: | ---: | ---: |
| `apps/cli/test/headless-engine.test.ts` | 2 | 0 | 0 |
| `apps/cli/test/cli.test.ts` | 18 | 0 | 0 |
| `apps/engine/test/module-credential-host.test.ts` | 3 | 0 | 3 |
| `plugins/ssh/test/public-resources.engine.test.ts` | 9 | 0 | 0 |
| 合计 | 32 | 0 | 3 |

跳过项为既有 Windows 测试。Linux 同轮单独通过构建后的 CLI 和 Engine 入口两项回归。桌面和 CLI 构建退出 0。macOS、Windows 运行路径及候选安装包启动器实测留待平台验收。 [桌面构建](/tmp/huhu-t10-task02.OeRQ79/test.log) · [CLI 构建](/tmp/huhu-t10-task02.1Y6rYU/test.log)

## 静态检查

`pnpm lint`、`pnpm format:check` 和 `pnpm knip` 均退出 0。 [最终检查日志](/tmp/huhu-t10-task02.MK6cij/test.log)

根类型检查的并行运行遇到内存压力。恢复后先运行 `pnpm --filter "./vendor/*" run build:types`，再用 `pnpm -r --workspace-concurrency=1 run typecheck` 检查相同的 24 个工作区包。前 23 个包通过，最后的 CLI 包发现测试夹具使用了 ES2023 类型目标之外的 `Promise.withResolvers`。改用项目已有的 Promise 构造方式后，`pnpm --filter @huhu/cli typecheck` 退出 0。随后用 `--maxWorkers=3` 通过构建后 CLI 和 Engine 的两项回归。 [串行工作区检查](/tmp/huhu-t10-task02.v5rUMt/test.log) · [CLI 类型复查](/tmp/huhu-t10-task02.ljBtDW/test.log) · [回归复查](/tmp/huhu-t10-task02.AQR6PM/test.log)
