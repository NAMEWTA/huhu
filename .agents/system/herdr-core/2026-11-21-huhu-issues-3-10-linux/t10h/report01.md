# Linux 最终联验静态审查

Lead `t3p`，审查 `t10h`，任务 `task01.md`，工作树 `agent-linux`。基线与 HEAD 均为 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。

## 范围

| 冻结差异 | 审查时 Git blob |
| --- | --- |
| `plugins/agent-cli/test/native-receipts.live.test.ts` | `e031bc9d75ac` |
| `tests/e2e/workflows/web-share.spec.ts` | `c2ed19f6a27b` |
| `scripts/accept-linux-candidate.sh`（含 `web` 和 `package`） | `fc69bfde737e` |
| `tests/e2e/knowledge/editor-s3-properties.spec.ts`（F02） | `3e3708858ef3` |

另只读核对 `EncodingConversion.tsx`（`17bd3b5464af`）以及直接调用契约、候选包和运行时夹具。

## 结论

`package` 模式会选中四个普通冒烟用例和凭据用例，但 shell 冒烟的 Core socket 路径会阻断验收。将临时根前缀缩短到 Lead 提议的路径足以消除该阻断。F02 的磁盘字节与确认顺序符合当前 UI。CLI/MCP 主链已各自接通，回答证明的时序断言和 Web 双向内容保真仍有漏验。

## 规格问题

1. **P1 · `package` 的 shell 冒烟会在启动 Herdr Core 时被路径长度检查拒绝。** 包装器把 `TMPDIR` 设为 `/tmp/huhu-candidate-session.XXXXXX/tmp`，而打包夹具在该目录下创建 `huhu-pk-profile-XXXXXX/runtime` 并传入 `XDG_RUNTIME_DIR`。主进程将环境传给 Engine，Agent Core 据此生成 93 字节的 `huhu-xxxxxxxx-xxxx.sock` 完整路径。Core 先检查旁置的 `huhu-xxxxxxxx-xxxx.holder.12345678.sock`，完整路径长 **109 字节**，超过 Linux 的 **107 字节**上限。最小改动是把包装器的 `mktemp -d` 模板换为 `/tmp/hc-a.XXXXXX`，保留现有独立目录、私有权限和退出清理。新根路径长 **16 字节**，Core socket 完整路径长 **75 字节**，holder socket 长 **91 字节**，余 **16 字节**。四项冒烟与凭据用例共五项的计数与配置相符。[包装器](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/scripts/accept-linux-candidate.sh:30) · [打包夹具](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/packaged/packaged.spec.ts:25) · [shell 冒烟](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/packaged/packaged.spec.ts:139) · [Engine 环境](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/apps/desktop/src/main/engine-supervisor.ts:136) · [Core 端点](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/packages/herdr-client/src/herdr-core.ts:34) · [Herdr 路径检查](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/paths.rs:27) · [Linux 上限](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/platform/unix.rs:124)

2. **P2 · Web 编辑内容被后一次桌面写入丢掉时，当前用例仍可通过。** 浏览器写入后分别断言含 `browserEdit`，桌面写入后只断言含 `desktopEdit`，然后把当前磁盘内容当成重开基线。若桌面保存丢掉 `browserEdit`、保留 `menuEdit` 并写入 `desktopEdit`，所有后续断言仍会通过。最小改动是在桌面写入之后同时核对三段文本，并在刷新及重开的编辑器中核对两次新增文本。当前 Web → 桌面方向是在离开网关后打开文档回读，覆盖跨端保存和读取。[双向编辑步骤](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/workflows/web-share.spec.ts:225) · [重开断言](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/workflows/web-share.spec.ts:326)

3. **P2 · 无证明阶段可能在消费者处理对应事件前结束。** 夹具把不匹配的 provider 帧写入管道后立即记 `resolution-without-proof`。用例此前已经读到 `unknown`，看到日志后立即再读持久状态，仍可能读到旧值。重交也直接从账本返回。若 helper 或 Engine 稍后错误接受该批帧，用例可能已放行真正确认帧，最终 `accepted` 无法证明采用了正确来源。最小改动是先等读取侧确认已处理无证明批次和一次对账，再断言 `unknown`，然后放行真正证明。两个入口丢弃首个回答响应的写法覆盖同入口查回执与重复提交，首个调用本身已走到响应阶段。[状态断言](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/agent-cli/test/native-receipts.live.test.ts:626) · [夹具发送顺序](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/agent-cli/test/fixtures/codex-receipts-provider.cjs:123) · [重复提交回读](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/tasks/src/engine/native-replies.ts:122)

## 资源清理

**P3 · 新夹具的部分失败发生在清理范围之外。** Web 候选夹具在进入 `try` 前创建子目录、写初始 Vault，任一步抛错都绕过夹具清理。启动或身份检查失败时，`app.close()` 若拒绝，后面的 `rmTree` 也不会执行，且原错误会被掩盖。包装器的 EXIT trap 仍会尝试清理总临时根。CLI/MCP 夹具同样在 `try` 前创建子目录。最小改动是从成功分配临时根后立即进入清理保护，把应用关闭和目录回收放进嵌套的 `finally`，保留首个失败的诊断。成功取到夹具后，两条主路径已有各自的关闭处理。[Web 创建及失败路径](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/workflows/web-share.spec.ts:22) · [CLI/MCP 创建顺序](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/agent-cli/test/native-receipts.live.test.ts:446) · [包装器清理](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/scripts/accept-linux-candidate.sh:30)

## 其余静态核对

- 两条参数化用例分配各自的 Vault、Engine、合成 provider 与 Core，任务操作经所选 CLI 或 HTTP MCP 发出，桌面调用用于准备和授权，Core 查询用于核对身份。输入哈希、问题与回答、结果、消费 ACK 和一次原生输入均有具体断言。真实 Core 路径以 `HUHU_AGENT_LAUNCH_TEST_BIN` 为启用条件。[入口与授权](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/agent-cli/test/native-receipts.live.test.ts:487) · [原轮证据](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/agent-cli/test/native-receipts.live.test.ts:655)
- Web 初次与重开都复用同一固定摘要的候选快照并核对进程身份。邀请撤销与两次布局改动各自有 UI 和落盘断言。包装器的 JSON 门槛要求预期结果数，并拒绝跳过、意外结果和 flaky。[候选身份](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/helpers/candidate-package.ts:76) · [邀请与关窗](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/workflows/web-share.spec.ts:270) · [报告门槛](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/scripts/accept-linux-candidate.sh:73)
- F02 对 Markdown、TXT、JSON 比较预览前和预览后原始 Buffer，点击明确的转换按钮后逐字节比较 UTF-8 并检查编辑器。组件在编码和源版本与预览一致时才展示待确认内容。预览服务只读，转换入口才调用 `replaceRecoverably`。未发现 F02 确定性问题。[F02 断言](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/knowledge/editor-s3-properties.spec.ts:308) · [UI 预览与确认](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/notes/src/ui/viewers/EncodingConversion.tsx:19) · [服务读写边界](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/notes/src/engine/service.ts:654)

## 未运行的验证

本次仅静态读取。CLI-only/HTTP MCP-only Vitest、普通及候选包 Web E2E、F02、`package` 五项、typecheck、build、安装与打包均未运行。问题 111 的 `engine-state` 未出现及其根因待查，以上 holder 长度结论只对应触发 Core 启动的路径。
