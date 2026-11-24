# #7 H2.2／H2.3 SSH 主机与模块自有认证交付报告

## 交付范围

`t179` 在 `impl/huhu-issues-3-10-ssh-confirmed-ui`、基线 `3b837a7dcbe4cbee24284069f29f03fd0575fb61` 完成 H2.2 桌面入口及 H2.3 的主机跳板引用路径。当前改动留在工作树供 Lead 整合。根锁文件 Git blob 为基线的 `ce368ced5888cc3775d8e0265113737839e989d5`。

- 新建和编辑通过 `ssh.hosts.configure` 原子提交配置、预期版本及认证补丁。密码、Agent、粘贴私钥和本机身份文件各使用已有后端类型。本机文件选择复用 preload，凭据编辑框留空，用户可显式替换、清空或撤销清空。保留后端给出的未配置、暂不可用、需要重新配置及损坏状态。文件和 Agent 的连接可用性由实际连接检查。
- 编辑失败保留着当前草稿并把焦点移到错误提示。标签、一个直接跳板、连接超时、协议保活间隔和次数可编辑。原目录分组会显示并保留，分组由现有目录合同单独维护。
- `ssh.hosts.copy` 使用源主机 ID 和预期版本，返回独立主机 ID 及其认证状态。`ssh.hosts.remove` 使用目标 ID 和预期版本。删除前列出以该主机为跳板的引用方，可进入引用方编辑并单独保存解除操作。Engine 在提交时再检查。Web 保留读取，主机维护动作对桌面宿主开放。
- 实现位于 `plugins/ssh/src/ui/{HostEditorDialog.tsx,HostRecordActionDialog.tsx,host-record.ts,SshModule.tsx,ssh.css}`。定向测试位于 `tests/e2e/ssh/`。更新了 `H2.2-host-record.md` 和 `H2.3-host-references.md` 的客户端证据。
- 六文件原型的重新计算指纹为 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`。比对了本机 Motty `2daa9db582e16edf60a60b7ada26f47f808f973c`（Apache-2.0）的 `internal/workbench/host_edit_save_failure_test.go` 和 `internal/workbench/host_auth.go`。采用失败后保留表单、已提交状态与认证方式分开观察的验证思路。组件、状态、存储由 Huhu 现有实现提供。

## 实跑结果

Windows x64、Node 24.21.0、pnpm 12.10.1、Electron 44.9.1／Chromium 152.0.7977.167。用缓存的 `corepack pnpm@12.10.1 --config.verify-deps-before-run=false` 运行项目命令。测试 Vault、文件和凭据均为合成数据，SSH 连接只由 Engine 回归访问回环夹具。

| 检查 | 命令与结果 |
| --- | --- |
| 构建与类型 | `--filter @huhu/desktop exec electron-vite build` 和 `--filter @huhu/plugin-ssh run typecheck` 均退出 0。构建保留 `packages/contracts/src/ids.ts` 的 Node `crypto` 浏览器外置提示，回环 Web 用例通过。 |
| 真实工作台 | `exec playwright test tests/e2e/ssh --timeout=120000 --trace=off --output <临时目录>`，最终 6 项通过，24.9 秒。三项新增用例覆盖 Safe 未初始化／锁定／停用、四种认证、复制独立性、留空与显式补丁、并发失败保留草稿、跳板循环、解绑前阻止和解绑后取消与提交。三项既有导入用例通过，包含八种格式、分组重试及回环 Web。 |
| 存储、版本和认证 | `exec vitest run --maxWorkers=1 --minWorkers=1 plugins/ssh/test/host-auth.engine.test.ts plugins/ssh/test/directory.test.ts plugins/ssh/test/host-import.test.ts`，3 文件 17 项通过。包括受保护存储写失败后旧版本及凭据保持，合成回环连接上的密码、加密私钥和本机身份文件使用。 |
| 检查 | 目标文件 `oxlint -c oxlint.json`、`stylelint`、`oxfmt --check` 通过。`check-ui-colors`、`check-css-layers`、`check-css-classes`、`check-css-ownership`、`check-css-duplicates` 和 `git diff --check` 通过。 |

实际截图中使用合成的主机名和地址。 960 × 600 编辑冲突与草稿（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/task02/legacy-7984bff4/evidence-task02/ssh-edit-conflict.png`） · 删除前的跳板引用（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/task02/legacy-7984bff4/evidence-task02/ssh-references.png`）

## 合同缺口和未测

- **H2.3 其他引用。** 当前 `ssh.hosts.list` 和 `HostConfigurations.assertUnused` 能识别的实际引用为 `jumpHostIds`。工作区模板、独立路由及转发尚缺跨对象引用查询和删除时的服务端复核。后续最小合同是按稳定 hostId 返回引用类型、对象 ID 和显示名，删除按同一边界复核后返回结构化引用阻挡。三类引用的联合验收仍待该合同。
- **H2.6 未保存测试。** `ssh.connect` 只接受已保存 hostId。建议提供桌面专用、可取消的草稿测试能力，接收当前连接字段、认证方式、临时凭据补丁，以及需要保留凭据时的 hostId 和预期版本。按正常目标绑定和主机信任规则处理，返回认证成功、目标可达待认证或失败三态，携带请求标识供前端丢弃过时结果。测试连接结束或取消即释放，主机目录、凭据、信任记录和正式会话保持原状。当前报告该缺口。
- **验收边界。** 原目录分组通过目录能力构造并回读，H2.2 编辑器展示并保留它。身份文件用真实 preload 调用，自动化在 Electron 文件选择边界返回隔离 Vault 中的合成路径。未运行其他操作系统、打包候选或旧库迁移。旧主机的界面只继续读取及连接，宽工作流中使用 `ssh.hosts.save` 建旧式夹具后编辑、或断言 `safe://` 写入的旧验收留待 Lead 更新。

## Modern Web Guidance

从本机缓存完成 `search` 和 `retrieve`，涵盖原生模态、表单标签和校验、HTML 关联提交、动态错误。保留原生字段约束和可访问错误摘要。窄视口滚动表单时，提交按钮保持在视口，失败后焦点与视口回到错误摘要。


## Lead 核验

逐项对照实机及身份记录，实施提交 ff3221aa。H3.1 使用独立后续任务。
