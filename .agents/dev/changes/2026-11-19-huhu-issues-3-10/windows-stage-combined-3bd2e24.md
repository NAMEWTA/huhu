# Windows 组合阶段安装包

Windows x64 build 26300，Node 24.21.0，pnpm 12.10.1。以干净本地提交 `3bd2e245d0eff8ffef8eb94f80c6106d73047ba9` 构建 Electron 44.9.1、Chromium 152.0.7977.167。Electron Builder 26.18.0 生成未签名 NSIS。安装包和应用目录保存在原工作区 `temp/issue-baseline/packaged-3bd2e24-win-x64/`。

| 文件 | SHA-256 |
| --- | --- |
| `HUHU-0.0.1-rc.4-win32-x64.exe` | `752c05f553e2ab9f3904e5d523bc58c11930eb4a43a7e557b4300bb19cac5941` |
| `HUHU-0.0.1-rc.4-win32-x64.exe.blockmap` | `8c221b681d54a17caac2e6b075240fed41f2f7be219e5a6f2e5840aa026f2dd7` |
| `win-unpacked/resources/app.asar` | `095250cb33652a17510c60c0d3a0ebca8f6b491e1c1e4e1c273395b4f508ef02` |

- `pnpm build` 与本地 NSIS 打包分别退出 0。应用归档 51,490 项通过清单、版本标识与测试源排除检查。采用冻结构建文件执行打包，初版凭据包停止在归档生成前，本次完整生成归档和安装包。原工作区日志 `core-finished/t137.log`、`core-finished/t138.log`。
- 实际应用目录用 Playwright 启动隔离用户数据。笔记、任务、Vault 导出、随包 Core 0.1.19 shell 和随包 CLI 三项通过。旧 Automations 规则夹具在 Windows 条件跳过。原工作区日志 `core-finished/t13h.log`。
- 真实 Electron UtilityProcess 强制从该 ASAR 加载 `@napi-rs/keyring` 和对应 Windows x64 原生模块，合成凭据生命周期 23 项通过。原生文件从 `app.asar.unpacked` 读取，SHA-256 `52b16658275b7848f8081a6542fee3448f1b1c5d3a36487107ae0e7cec95ac6f`。测试用隔离范围的系统键。原工作区日志 `core-finished/t13f.log`、`native-package-replay-6eCChS/synthetic-pKoGKH/module-placement.ndjson`。
- 同一应用目录在 Edge 157.0.4341.60 内用本机非回环地址验证两份邀请、三个独立浏览器会话、笔记与任务深链刷新、同一桌面数据、文件导入导出和撤销。外部 CLI 与 MCP 目录默认空，显式授权后能读同一笔记，撤销后调用立即拒绝。包内 Engine 在 Safe 锁定的隔离 Vault 可读 Mail 账号目录。原工作区日志 `core-finished/t13j.log`、探针 `packaged-web-tool-edge.cjs`。

本阶段实测使用安装包构建目录中的应用，系统安装向导尚待隔离执行。W8.3 需纳入生产 Tasks 调用切换和真正的跨入口回执再生成包。桌面看板草稿离场和第二台设备的局域网连接分别保留验收。
