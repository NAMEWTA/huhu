# Windows 组合阶段候选 3290af1

本地 `feature/issue-fix` 与组合源代码的阶段检出为 `3290af19c012c320bb4c7d89c2ab66baf36357ae`。Windows x64 26300、Node 24.21.0、pnpm 12.10.1、Electron 44.9.1、Chromium 152.0.7977.167。应用构建标识为 `0.0.1-rc.4`，构建时间 `2026-11-20T10:06:29.322Z`。

| 文件 | SHA-256 |
| --- | --- |
| `HUHU-0.0.1-rc.4-win32-x64.exe` | `379f305b90efca1bda80698dcac1165cbf58a330ba6a3b5da7f8827363916549` |
| `HUHU-0.0.1-rc.4-win32-x64.exe.blockmap` | `012bacc0873cd6b79d872f0e92815d97c70962e16dcf0a5968da6eea3bb48822` |
| `resources/app.asar` | `22afd880d123cd158c07840f18bf8505df7cae1544b25995a1f8293e1b0a58e8` |
| `resources/codex-dispatch/helper.cjs` | `ada4a9893fc6fabe3bfb0c5d6069d59d51a34d973de9202ffe61b44657f1e040` |

归档包含未签名 NSIS、block map、SHA-256 清单和原始输出。安装包独立解出七份文件，字节与实测应用目录一致。ASAR 的 51,505 项清单及 46,957 个文件摘要通过检查。固定 Herdr Core 0.1.19、Windows Keyring addon、CLI、Codex helper 和许可清单均包含在内。实测使用解包应用，Windows 安装向导待验收。 [候选归档](../../../../temp/issue-baseline/packaged-3290af1-win-x64/)

## 运行结果

- 组合源代码的全仓 `typecheck`、`lint` 和 `build` 退出 0。第一次 NSIS 在 Windows 替换 Electron 暂存目录时出现 EPERM/EBUSY，随后从同一构建、同一提交重跑到系统盘独立输出目录，退出 0。原始记录为 `t15w.log` 和 `t15x.log`。
- 真实包内 Playwright 通过三项，覆盖笔记、任务、ZIP、随包 Core shell 和随包 CLI。旧 Automations 的非 Windows 监督进程夹具按条件跳过一项。
- 真实 Windows Codex 0.171.0 与固定 Core 从包内生产 helper 启动，模型端为本机合成 Responses 服务。原任务正文只到达一次，同一会话只向原任务写回一条结果。受控原生回答的确认事件兼容另有源代码证据，真实 Codex 的生产回答能力门槛仍待验证。
- Edge 157.0.4341.60 在同一台 Windows 的非回环地址使用两份邀请与三个独立浏览器会话。深链重开、共享同一笔记和任务、上传下载、剪贴板回退、依邀请撤销及停用分享后的桌面访问均通过。包内 MCP、CLI 默认工具目录为空，单项授权与撤销生效。Safe 锁定时，Mail 账号目录仍可查询。
- Electron UtilityProcess 从该 ASAR 加载 Keyring 包和配套 Windows x64 解包模块，以合成范围复跑 23 项原生凭据检查。固定模块 SHA-256 为 `52b16658275b7848f8081a6542fee3448f1b1c5d3a36487107ae0e7cec95ac6f`。原工作区记录为 `t16j.log`。
- 同提交全仓 Vitest 初跑 1,183 项通过、38 项跳过、2 项失败。CLI 的 `process.chdir` 在 fork 进程池复跑 11 项通过。固定 Core 早退出用例的一次空绑定在同提交定向复跑通过。保留首次及复跑原始结果。原工作区记录为 `t160.log`、`t16f.log`。

本阶段证据覆盖 Windows 基础包、一次原生派遣与结果及授权与邀请。W8.3 与 T7.2 的共同签收还需由切换后的 MCP/CLI 完整任务路径、确认后的看板草稿离场和布局恢复完成。单独记录了真实第二台设备及真实邮箱和 SSH 主机的环境依赖。
