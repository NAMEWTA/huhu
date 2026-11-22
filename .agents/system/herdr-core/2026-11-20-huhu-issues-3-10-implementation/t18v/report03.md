# task03.md · CLI 安全文件输入与本机回执

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task03.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task03.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report03.md
- 执行结果 — done
- 模型 — gpt-6.2-sol / high / fast
- 工区 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — impl/huhu-issues-3-10-production-cutover
- 基线 — 69776e6887fb8ff75f4992f81445ebc8f15fa959
- 提交 — 815d9917b2a32f246725343fd633040fe39b7acf

## 结论

生产 huhu call 已支持 --input-file。读取普通 UTF-8 JSON 文件，支持 UTF-8 BOM，与 --input-json 互斥。文件读取使用共享网关的 8 MiB 上限，完整请求继续经过原认证、限额和校验。文件打开、类型、大小、编码和 JSON 错误在联系 Engine 前返回退出码 2。stderr 只说明错误类别。远端业务响应沿用原 JSON 和退出码映射。

受保护规则写入通过仅当前用户可读的本机请求文件传值，命令行只带路径。E07 联验实际启动构建出的 CLI，观察同一 Vault 中的写入、轮换、清除、授权撤销，以及 Core 确认缺失后的原运行收尾。对账使用文件中同一 intentId 和原版本。不同意图各执行一次，重复意图读取原 runId。仅涉及 apps/cli 与切片证据。

## 验证

| 验收 | 实际结果 |
| --- | --- |
| CLI 输入与错误 | 基线 3 个定向用例因缺少 --input-file 失败。实施后全部通过。包含中文带空格路径与 BOM、缺失文件、目录、非法 UTF-8、坏 JSON、超限和与行内输入冲突。失败返回 2，stdout 空，stderr 固定且无文件路径或内容。 |
| 真实 Windows CLI/MCP | 正式单文件 CLI 子进程读取临时 JSON，经 Engine 认证调用。断言 argv、环境、stdout 和 stderr 均无两个合成值。获批变量可写、轮换、清除，未获批规则和名字被拒。Core 确认缺失后同一意图并发重投返回原 runId，从待核对收尾成功。覆盖撤权、异输入、异身份、Vault 还原和重开。 |
| 固定版本与结果 | pnpm 12.10.1、Node 24.21.0、Vitest 3.2.7、本机随包 Core 0.1.19。使用构建 CLI 的完整 CLI 套件 15 项通过，生产源码入口另复跑 E07 1 项通过。CLI 构建、TypeScript、定向 lint、格式和 Git 检查通过。 |
| 构建证据 | 提交后重建 apps/cli/dist/cli.mjs，SHA-256 与套件所用文件一致，为 729710afd62ec3a2b63712836f1a71c0e4a187fb7d33fc814e5968c2298c3766。已核对实际 call --help 列出 --input-file。 |

[使用方式与复跑命令](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/E07-cli-input-file.md) · [CLI/MCP 回归](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/cli/test/approved-terminal.test.ts)

## 阻碍与接续

本切片满足普通文件输入及 E07 CLI 取证。G3.1 stdin 输入与 G3.3 通用幂等键和回执仍属后续范围。工作树干净。测试经工区本机进程执行，t18v pane 保留供后续派发。

## Lead 验收

由 Lead 追加。
