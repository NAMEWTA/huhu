# Windows 候选 78e180b7 的组合验收

源码 `78e180b7aa6fc450505b332d7f446e07cc405b07`，HUHU `0.0.1-rc.4`，Windows x64，Electron `44.9.1`。使用该分支自带的 Herdr Core `0.1.19` 与 Windows 原生 Codex CLI `0.171.0`。Codex 的 Responses 输入来自 127.0.0.1 合成夹具，账号和测试 Vault 均隔离。

| 本机产物 | SHA-256 |
| --- | --- |
| Windows NSIS 安装包（未签名） | `b23b5b0bf0b8d9a55fd224eb808b9b08f739702753403af8a198b7ded2463afc` |
| 包内 Herdr Core | `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d` |
| 包内 Windows 受保护启动宿主 | `2a5a8d1598354ce8191a5dbd42c79fb534e5a3ac33d60f642d930daf63dbc5b9` |
| 包内 Codex helper，和同版源码一致 | `b8ce0ff75370d0a12512a36e9b02cc0ece5812bd7f427505e900c7e26d8bbae8` |
| 实际使用的 Codex CLI | `cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7` |

`pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`pnpm knip`、`pnpm build` 全通过。冻结源码的桌面及 Web 工作台端到端共 29 项通过，包含真实 SSH 回环转发、传输和编辑、Mail 授权及通知、保险箱标签、邀请撤销、关窗保存联动，以及从两个 Space 打开准确文件和真正新建 Git worktree。Windows 原生宿主构建和测试通过。 [组合门禁日志](<D:/Document/code/huhu/temp/issue-baseline/78e180b7-window-candidate.log>)

原包中 MCP 创建并派遣，CLI 读到 `native_deferred` 请求。非法选项和旧版本均在下一次模型调用前被拒绝。CLI 选 Blue 并用同一 reply ID 重交，得到原请求的 `accepted` 回执。回环 Responses 记录同一调用的所选答案仅消费一次，两次模型请求对应一条回答和一条结果。桌面结果从任务定位到 `sess-mwpk0mgbpkca`，人工完成后仍只有一条结果。与源码一致的随包 helper 在实际程序里工作。结束后隔离 Core 状态为 5。 [原包运行证据](<D:/Document/code/huhu/temp/issue-baseline/78e180b7-native-retry.log>)

本次首次包测沿用了上一个候选的短提交断言，校正为检查本候选的构建元数据后重跑，安装包保持相同。正式 OAuth 需要注册的客户端和合成测试邮箱。Mail 会话重交与站点浏览器回执竞争仍按独立审查返修。 [独立审查](<D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1bh/report01.md>)
