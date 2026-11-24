# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t34
- 实际执行终端 — t4c
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t34/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t34/report01.md
- 执行结果 — blocked（候选已交付，仍有接线和未闭合的切片）

## 结论

候选在独立 SSH 密钥库、未保存草稿测试、工作台交互认证、逐跳路径、OpenSSH 双向字段同步、辅助代理、运行分栏、终端控制、录制和本地 PTY 适配上补齐了可验证的缺口。全部 13 个切片逐项核对见下表。用户确认的原型版本为 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`。Motty 采用 Issue 固定版本 v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`，Apache-2.0。

## 产物与改动

工作目录为 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-ssh-ui`。候选用临时索引生成。分支 HEAD 仍为 `82f0d188e9eafc6bbc33b65376240e4eea019e74`，业务工作树保留候选内容。候选顶端 `53e516ca830e975f081066f41cd9f14ad2b2d6c6`。

| 候选 | 组 | 产物 |
| --- | --- | --- |
| `9e7230e6ba97cf198d7ee9a74ac609308f2ace47` | H2.5–H2.6 | SSH 私钥库、主机引用、草稿测试。 |
| `246bae9b8e680de1358008f893a4e13a79b990e5` | H3.1–H3.3 | 多轮待答、跳板启停、工作台路径快照。 |
| `e609047e02c790f9e5d332791e0ff0977c8189b3` | H3.4–H3.5 | 配置同步和受核验的辅助代理分享。 |
| `0f3099f2d7c6d1f3fe7c4e0a384375b33c5d85f5` | H4.3 | 运行布局版本、交换、关闭、最大化及导航。 |
| `e84668be8f9c115c0d7804b6cf4913f86a98f904` | H5.1–H5.4 | 终端桥与所选目标控制、录制、本机环境发现。 |
| `53e516ca830e975f081066f41cd9f14ad2b2d6c6` | H4/H5 验证、H11.3 和证据 | Herdr PTY 适配、回环补验、四个 E2E 规格用例、证据。 |

证据按指定路径加入候选树。工作区沙箱对项目文档目录只读，物理文件随 Lead 合并落盘。

```sh
git show 53e516ca830e975f081066f41cd9f14ad2b2d6c6:.agents/dev/changes/2026-11-19-issue-7-ssh-module/verification/H-remaining-linux.md
```

| 切片 | 基础 | 候选结论与未闭合项 |
| --- | --- | --- |
| H2.5 | 部分 | 密钥库与主机引用候选实现。回环验证加密 Ed25519 认证、公开摘要、导入错误口令和引用保护。待注册和桌面实测独立系统 agent。 |
| H2.6 | 缺失 | 三态与取消回收候选实现。指纹未知时提示在正式连接中确认。保留凭据只用于同一端点。待注册及 E2E。 |
| H3.1 | 部分 | 补齐桌面/Web 工作台多问、多轮、OTP 的精确待答。t47 已实现外部主体键盘交互，合并时保留两个作用域。OpenSSH CA、用户证书和本机身份恢复流程未补齐。 |
| H3.2 | 部分 | 路由页与主机编辑用同一主机定义。回环验证环校验、启停和旧连接快照。批量跳过/覆盖事务尚缺，现有 ModuleCredentials 只支持单实体提交。 |
| H3.3 | 部分 | 逐跳身份、阶段及时间线，保留实际连接 ID，失败止于当前跳。出站代理继承/直连/覆盖、ViaShell 及监控和转发路径仍缺。 |
| H3.4 | 缺失 | 以主机 ID 与所选 Host 块为映射，按指纹、版本、字段解析预览与双向应用。单个字面 Host 块支持 ProxyJump、IdentityFile、两项 ServerAlive；有 Include、Match、多值或会改变路由的 ProxyCommand 时给出行号。采用手动预览和应用。 |
| H3.5 | 缺失 | 用现有 SSH 连接借用反向回环监听。已验实际回环检查、CONNECT、停止。远端需 `ss`，测试边界为代理接受 CONNECT。 |
| H4.3 | 部分 | 分栏运行布局、顺序、最大化、根比例、输入焦点与单分栏关闭。跨窗口和重挂需新增宿主接口，当前 `window.huhuHost` 无对应方法。 |
| H5.1 | 部分 | 保留共用 xterm，候选桥补当前 socket 的写入/resize 拒绝、明确接管与重挂。中文 IME、宽字符、全屏和协议仍需真实验证。 |
| H5.2 | 部分 | 可见目标、锁定、预览、插入与发送 UI 已实现。目标输入仍需共用 TerminalView 提供回调。拖动工具栏、快捷命令分组和排序尚缺。 |
| H5.3 | 缺失 | 显式录制、隔离保留、文本回放、查找、高亮和链接。回环替身验证跨字节 UTF-8、截止边界与重开读取。时间轴回放和终端内实时搜索尚缺。 |
| H5.4 | 缺失 | 本机 Shell/WSL 发现、原环境重连、会话管理与 Herdr PTY 适配。需注入真实宿主后验证停用 Agent CLI、Linux 原生 PTY 与 Windows WSL。 |
| H11.3 | 部分 | 基线和并行 `b25c6322` 已有 CLI/MCP 资源、凭据更新、待答、作业和 SFTP 分段证据。此次增加两条同一主机的串联用例。需在汇合版本运行。 |

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| SSH 单包类型 | Node 24.21.0，pnpm 12.10.1，`pnpm exec tsc --noEmit -p plugins/ssh` 退出 0 | `/tmp/huhu-t34-checks.TPPZz3/tsc.log` |
| H2.5/H2.6/H3.2/H3.4/H3.5/H4.3 回环 | `plugins/ssh/test/draft-and-keys.test.ts` 8 项通过 | `/tmp/huhu-t34-checks.TPPZz3/draft-and-keys.log` |
| H3.1/H5.3 与既有 SSH 会话回归 | `plugins/ssh/test/manager.test.ts` 20 项通过 | `/tmp/huhu-t34-checks.TPPZz3/manager.log` |
| H5.1/H5.4 输入与宿主生命周期 | `plugins/ssh/test/terminal-runtime.test.ts` 3 项通过，使用替身流和 Core | `/tmp/huhu-t34-checks.TPPZz3/terminal-runtime.log` |
| 主机凭据与已支持恢复行为 | `plugins/ssh/test/host-auth.engine.test.ts` 4 项通过 | `/tmp/huhu-t34-checks.TPPZz3/host-auth.engine.log` |
| 新增 E2E 文件 | 两文件 `node --check` 退出 0 | `tests/e2e/ssh/{remaining,entry-parity}.spec.ts` |
| 可写边界和集成 | `git diff --check 82f0d188 53e516ca` 通过，禁止清单在候选差异中为空。只读试合并 `b25c6322` 显示三处冲突 | 见下节 |

所有 Vitest 逐个文件运行，`--maxWorkers=1`。网络均为回环夹具，未使用真实凭据。

## 未运行的验证

- `tests/e2e/ssh/remaining.spec.ts` 的「SSH 密钥库生成公开摘要，草稿测试可达后由字段修改清除」和「交换、最大化和关闭 SSH 分栏时，其他分栏保留原会话」。
- `tests/e2e/ssh/entry-parity.spec.ts` 的 `CLI updates SSH authentication, approves trust, reads job output and transfers bytes` 与对应 `HTTP MCP` 用例。依赖 t47 自有文件会话、授权与传输接口。
- 实际桌面、Web、多窗口、原生 PTY、WSL、远端 `ss` 检测、剪贴板和 IME 实测，以及 Playwright、Electron、xvfb、截图、构建、打包、全量测试和全仓门禁。

## 需 Lead 接线

### 能力定义与注册

在 `plugins/ssh/src/engine/capabilities.ts` 从下列同一来源导入并合入 `sshCapabilityDescriptors`。记录中的名称全部带 `exposable: true`、`defaultExposed: false`；各注册器仍检查调用者。

```ts
import { sshKeyDescriptors } from "./key-library-capabilities.js";
import { sshDraftDescriptor } from "./draft-connection.js";
import { sshAuthenticationDescriptor } from "./authentication-capability.js";
import { sshConfigSyncDescriptors } from "./config-sync.js";
import { sshProxyShareDescriptors } from "./proxy-share.js";
import { sshWorkspacePaneDescriptor } from "./workspace-pane-capability.js";
import { sshRecordingDescriptors } from "./terminal-recordings.js";
import { sshLocalShellDescriptors } from "./local-shell.js";

// Add these entries inside sshCapabilityDescriptors.
...sshKeyDescriptors,
hostsTestDraft: sshDraftDescriptor,
authenticationAnswer: sshAuthenticationDescriptor,
...sshConfigSyncDescriptors,
...sshProxyShareDescriptors,
workspaceRunChangeLayout: sshWorkspacePaneDescriptor,
...sshRecordingDescriptors,
...sshLocalShellDescriptors,
```

在 `plugins/ssh/src/engine/index.ts` 导入下列注册函数。构造 `hosts`、`manager`、`runs` 后注册。用 `registerSshTerminalBridge` 替换原来的整个 `terminalBridge:ssh` 内联实现。将本地 PTY 启动器作为 Engine 装配参数注入，下例以 `localPty` 表示。

```ts
import { registerSshKeys } from "./key-library-capabilities.js";
import { registerSshDraft } from "./draft-connection.js";
import { registerSshAuthentication } from "./authentication-capability.js";
import { registerSshConfigSync } from "./config-sync.js";
import { registerSshProxyShare } from "./proxy-share.js";
import { registerSshWorkspacePanes } from "./workspace-pane-capability.js";
import { registerSshRecordings } from "./terminal-recordings.js";
import { registerSshLocalShells, type LaunchLocalPty } from "./local-shell.js";
import { registerSshTerminalBridge } from "./terminal-bridge.js";

registerSshKeys(api, hosts);
registerSshDraft(api, hosts, manager);
registerSshAuthentication(api, manager);
registerSshConfigSync(api, hosts);
const proxyShare = registerSshProxyShare(api, manager);
registerSshWorkspacePanes(api, runs);
const recordings = execJobs && registerSshRecordings(api, manager, path.join(execJobs.runtimeDir, "ssh-recordings"));
const localShells = localPty && registerSshLocalShells(api, localPty);
registerSshTerminalBridge(api, manager, localShells?.attach);

// In the existing ctx.effect disposer, before manager.disposeAll().
recordings?.dispose();
proxyShare.dispose();
localShells?.dispose();
```

`huhu-plugin.json` 的 `contributes.capabilities` 追加这些精确名称。

```text
ssh.keys.list
ssh.keys.add
ssh.keys.remove
ssh.hosts.testDraft
ssh.authentication.answer
ssh.configSync.preview
ssh.configSync.apply
ssh.proxyShare.detect
ssh.proxyShare.status
ssh.proxyShare.start
ssh.proxyShare.test
ssh.proxyShare.stop
ssh.workspace.runs.changeLayout
ssh.recordings.list
ssh.recordings.read
ssh.recordings.start
ssh.recordings.stop
ssh.local.environments
ssh.local.list
ssh.local.open
ssh.local.close
```

### 真实终端宿主

- 通过主应用现有 Herdr Core 和 `@huhu/herdr-client` 的 `attachTerminal`，调用 `createHerdrLocalPty(core, attachTerminal)`，作为 SSH 的 `localPty: LaunchLocalPty` 装配参数。可调用现有 Core 管理类，生命周期不依赖启用 Agent CLI 插件。SSH 适配器以私有标签启动与恢复，读取 framed PTY，停止只触及自己的终端。
- `packages/ui/src/components/TerminalView.tsx` 的 props 加入 `onTerminalInput?(input: ((text: string, enter: boolean) => boolean) | undefined): void`。收到 SSH bridge 的 `{type:"mode",mode:"control"}` 才发布。返回函数须在关闭、观察或失去控制时拒绝，用原 WebSocket 发数据。先调用现有 xterm `term.paste(text)`，仅当明确点击「发送并回车」才写入一次 CR。多行「插入」只在 `term.modes.bracketedPasteMode` 启用时接受。每次关闭、重挂、降级或组件卸载清除回调。
- 跨工作台窗口沿用宿主隔离规则暴露专用 `window.huhuHost` 入口，传稳定的运行/分栏 ID，经 Engine 恢复现有 Shell。当前候选覆盖同窗口的布局和按 ID 重挂。

### 合并检点与台账

- 对 `b25c6322` 的试合并有三处冲突。`manager.ts` 保留 t47 的 `publicProbe.keyboard`、`pendingKeyboard`、`respondPublicKeyboard`、SFTP `externalClient` 分支，同时保留候选的工作台 `auth-waiting` 与 `draft` 分支。ssh2 的 `tryKeyboard` 对外部探针、工作台和草稿三类启用，各身份仍走原作用域。
- `shared/trust.ts` 的连接公共 shape 同时保留 t47 的 `source` 与候选的 `route`、`connectionId`，加上候选的工作台认证状态。 `ui/SshModule.tsx` 继续显示 t47 的外部工具连接/终端及关闭按钮，并取候选的路由、密钥、本地 Shell、录制和工作台认证入口。
- 上游文件、固定提交、许可证和改动已逐行登记在候选证据。共享仓台账 `docs/upstream/ledger.md` 由 Lead 从该表追加。

## 阻碍与接续

共享接线文件由并行实施规则保留。候选的独立业务和定向证据已提交，下一次集成需要合并上述三处冲突并注册能力。OpenSSH CA、批量路由事务、出站代理配置与中继、跨窗口和快捷库管理仍待实施。主会话需在合并版运行表列的桌面和跨入口验收。

## Lead 验收

由 Lead 记录结论。
