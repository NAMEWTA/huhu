# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t2r
- 执行终端 — t2z
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2r/task02.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2r/report02.md
- 执行结果 — done

## 结论

重启后的原账号修订保持一致。两个入口的旧断言都遗漏了同一用例中从 Mail 子集导入并保留的第二个账号。`toMatchObject` 对数组要求元素数量一致。已改为明确校验共两个账号、各自修订和认证状态。基线复现日志为 `/tmp/huhu-t2z-matrix-before.log`。

按 t19「mail.accounts.list」的可见账号、认证状态和待移除管理权约束，外部列表保留账号 ID、修订、认证状态、邮箱标识和所选目录的名称与路径，供按账号和目录调用后续工具。连接配置、OAuth 绑定身份、恢复指纹和底层目录属性留在工作台配置范围。完整定义供既有桌面/Web 工作台使用。待移除详情仅在桌面管理读取时返回。

## 产物与改动

- 候选提交 — `fc0447137cf0a7387abfcd375d5834f62ecaa61d`，临时索引生成，直接父为 `2b3fe70a9b3ad42933f57438f5a8ebf8f06d76fc`（`2b3fe70a`）。工作树与候选业务文件一致，分支仍在原 HEAD。
- `plugins/mail/src/engine/registration.ts` — 保留统一能力和目录，按受信调用入口选择工作台定义或工具摘要。
- `plugins/mail/test/tool-exposure.test.ts` — 在 CLI 和 HTTP MCP 调用中用精确投影断言验证两个账号，包括导入账号的未配置认证状态。
- `plugins/mail/test/mail-ai.e2e.ts` — 桌面调用失败时输出能力 ID 和 API 错误，便于区分前置环境与交互失败。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| CLI 和 HTTP MCP 双入口 | 两个入口各覆盖 48 个开放项和 5 个关闭项，各复核 19 项重启后的调用。每个入口观测到 3 次 SMTP DATA、1 次 IMAP STORE、1 次 AI 发送和 0 次 Core 启动。 | `/tmp/huhu-t2z-mail.log` |
| Mail 相关 Vitest | `pnpm exec vitest run plugins/mail/test` 通过，15 个文件共 60 项，沿用根配置并发。 | `/tmp/huhu-t2z-mail.log` |
| 构建 | `pnpm build` 退出 0，桌面资源的类名冲突检查为零。 | `/tmp/huhu-t2z-build.log` |
| 桌面和 Web AI 批准 | 定向 Playwright 1 项通过，在 Electron 44.9.1 / Chromium 152.0.7977.167 和 Playwright Chromium 上分别操作。待批准请求保持零发送，核对精确选区、Escape 关闭与焦点恢复，批准后的重复调用只返回完成状态。 | `/tmp/huhu-t2z-e2e-private.log` |
| 类型检查、lint、格式、Knip | `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 均退出 0。 | `/tmp/huhu-t2z-typecheck.log`、`/tmp/huhu-t2z-lint.log`、`/tmp/huhu-t2z-format-check.log`、`/tmp/huhu-t2z-knip.log` |

## 阻碍与接续

无。默认测试 D-Bus 在读取 AppArmor 策略时收到只读错误，导致首轮用例停在保存邮箱。按既有 Linux 凭据验证方式，复跑使用临时 XDG 目录与独立测试总线，在该总线的临时配置中设置 `<apparmor mode="disabled"/>`。合成 Keyring 探针先验证写入、读取与移除。复跑命令保存在 `/tmp/huhu-t2z-mail-e2e.sh`，日志见 `/tmp/huhu-t2z-e2e.log` 和 `/tmp/huhu-t2z-keyring-probe-private.log`。

全量测试由 Lead 收尾统一运行。

## Lead 验收


Lead 验收（2026-11-22）：通过。task01 候选 `f3e764e8` 合入集成 `e6fe4f5b`，Lead 修正 `2b3fe70a`；task02 候选 `fc044713` 快进到分支与集成；集成复跑 plugins/mail/test 15 文件 60/60。终端 t2z 关闭。
