# S1 邮件工作台回环证据

## 范围

任务 t17c 在 Windows 上验证 Mail 实际界面组件、桌面身份的 Engine HTTP API、真实 IMAP/SMTP 回环传输及持久结果。组合外壳的注册和完整安装包验收由 Lead 接续。确认稿与 7d17ffa6 中的四个资源一致，确认指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。 [原型确认](../prototype-review.md) · [行为规格](../spec.md)

| 路径 | 观察 |
| --- | --- |
| 添加邮箱 | IMAP 认证失败与在途取消不生成账号。通过后自动勾选 INBOX，不可 SELECT 的目录禁用。修改表单后旧发现失效，保存须选 INBOX。重开 Vault 后保留账号、手填端口和目录。同一发现会话等价重交返回同一账号。 |
| 草稿 | Edge 中阻断首次保存 HTTP 请求，关闭动作保留编辑器和正文。再次关闭完成保存，继续编辑时正文及粗体仍在。Engine 重开可按原 revision 读回，同期 SMTP DATA 为 0。 |
| 部分接受与待核实 | 首次 SMTP 仅接收明确接受的地址，UI 只允许勾选明确拒收的地址，Engine 也拒绝包含已接受地址的重试。第二次回环 SMTP 只收到所选拒收地址，最终确认丢失后显示「待核实」和 Message-ID，核对只刷新本机记录。重开 Engine 后保持未知，DATA 总数仍为 2。 |

[桌面宽度的部分接受](./S1-workbench/mail-partial-1440.png) · [窄窗的待核实](./S1-workbench/mail-unknown-390.png) · [可重复的渲染探针](./S1-workbench/workbench-renderer.test.ts) · [Engine 回环回归](../../../../../plugins/mail/test/outbox-engine.test.ts)

## 重跑

从工作树根执行。使用本机审核过版本的 Windows `pnpm.exe` 12.10.1，Node 24.21.0、Vitest 3.2.7、Playwright 1.65.0 和已安装的 Edge 157.0.4341.60。测试 Vault、账号、IMAP/SMTP 服务均为临时夹具。回环协定测试通过真实 Engine 配置与请求入口。渲染探针独立打包 Mail 实际组件以及现有 EngineProvider、UI 样式，Playwright 只将能力请求转给真实回环 Engine。外壳路由、preload、Web 会话和事件流未由此探针覆盖。

```powershell
$repo = $PWD.Path
$lockedPnpm = Get-ChildItem 'D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1' -Recurse -Filter pnpm.exe |
  Select-Object -First 1 -ExpandProperty FullName
& $lockedPnpm --dir $env:TEMP --version
$probe = 'plugins/mail/test/workbench-renderer.test.ts'
if (Test-Path -LiteralPath $probe) { throw "测试目标已存在" }
Copy-Item -LiteralPath '.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1-workbench/workbench-renderer.test.ts' -Destination $probe
try {
  & $lockedPnpm --dir $env:TEMP exec node "$repo/node_modules/vitest/vitest.mjs" run --root $repo --project '@huhu/plugin-mail' --maxWorkers=1 --minWorkers=1
  if ($LASTEXITCODE -ne 0) { throw "Mail 回归未通过" }
} finally {
  Remove-Item -LiteralPath $probe
}
& $lockedPnpm --dir $env:TEMP exec node "$repo/node_modules/typescript/bin/tsc" --noEmit -p "$repo/plugins/mail/tsconfig.json"
```

设置已有目录 `HUHU_MAIL_PROOF_SCREENSHOTS` 后，渲染探针会另存两张截图。普通 Mail 回归无需浏览器。组合版本按根锁完成依赖装配后重跑。
