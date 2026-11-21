# #7 H3.1 SSH 首次与变化指纹连接反馈

## 提交与范围

`t179` 在 `impl/huhu-issues-3-10-ssh-confirmed-ui` 完成并提交 `4f7713582cecb795b9a5def90be76a12d5f23a8e`，父提交为任务基线 `ff3221aa9a7b6be3813cdfd5ae622521e8ab1c22`。工作树干净。根锁文件仍为 `ce368ced5888cc3775d8e0265113737839e989d5`。公共装配沿用基线，新增能力声明和实现都在 SSH 插件。

- 首次弹窗显示发起连接的目标，以及实际跳点的主机名、地址端口、密钥类型和 SHA-256 指纹。用户可稍后核对、拒绝取消、仅本次信任或保存信任。关闭弹窗、切出模块或刷新桌面页面后，当前 Engine 可返回同一待答。网络计时和用户核对计时分开。
- 指纹变化在该跳认证之前阻断，弹窗并列显示旧记录和服务器提供的指纹。变化提示没有信任操作。独立「已知主机」入口按地址、端口、类型和指纹确认移除旧记录。保存新指纹要明确重拨并完成新的首次确认。
- 复用 `ssh.connect`、`ssh.hostKey.decide`、现有事件和共享 `Dialog`。桌面的可恢复连接通过 `ssh.connect` 新增的 `background` 选项发起，Engine 通过 `ssh.connections.status` 提供快照。新式桌面答复必须匹配 attemptId、hop 和 promptId。传统前台调用沿用原来的等待方式与答复合同。新增插件内 `ssh.knownHosts.list` 和桌面专用 `ssh.knownHosts.forget`，在 Vault 内用现有路径守卫、版本校验和原子写。
- 实现位于 `plugins/ssh/src/{engine,shared,ui}`，定向验收位于 `tests/e2e/ssh/trust.spec.ts` 和 `plugins/ssh/test/manager.test.ts`。已更新 H3.1 技术证据。
- 六文件原型指纹匹配已确认的 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`。核对本机 Motty `2daa9db582e16edf60a60b7ada26f47f808f973c`（Apache-2.0）的 `internal/workbench/known_hosts.go` 与 `internal/workbench/known_hosts_test.go`，参照独立核对、移除、重新询问和错误保留。界面及持久化实现复用 Huhu，采用范围为行为对照。

## 真实验证

Windows x64，Node 24.21.0，Electron 44.9.1／Chromium 152.0.7977.167。全部项目自动化使用本机缓存的 `corepack pnpm@12.10.1 --config.verify-deps-before-run=false`。连接使用项目的 `startFakeSsh`，绑定 `127.0.0.1`，凭据及主机密钥均为合成数据。

| 检查 | 命令及结果 |
| --- | --- |
| 桌面构建和类型 | `--filter @huhu/desktop exec electron-vite build` 与 `--filter @huhu/plugin-ssh run typecheck` 均通过。构建保留 `packages/contracts/src/ids.ts` 的浏览器 Node crypto 外置提示。 |
| 工作台定向端到端 | `exec playwright test tests/e2e/ssh --timeout=120000 --trace=off --output <临时目录>`，最终 9 项通过（38.3 秒）。三项新连接验收及六项主机编辑、复制、导入和 Web 既有路径。 |
| 首次与恢复 | 直连核对独立夹具指纹。Esc 退出、切出 SSH 再进、刷新 Electron 界面后均读到同一待答身份。确认前服务端认证数为零。拒绝和仅本次信任后磁盘无新增记录，保存后重连无重复提示。缺 promptId、过时 attemptId 或已消费跳的答复都返回 `applied:false`。 |
| 准确阻断及复核 | 先保存两跳旧指纹，再在同一回环端口换第二跳实际服务端密钥。按第 2 跳阻断，目标认证数为零，跳板随后关闭。取消移除时文件字节相同，确认只移除旧目标指纹并保留跳板和原注释。重新连接仅确认第二跳，通过新指纹后才认证。 |
| 回环 Web | 真实浏览器可完成现有前台连接和指纹核对，可读保存后的 Known Hosts。Web 直接调用桌面移除能力得到 `PERMISSION_DENIED`，记录保留。 |
| Engine 全 SSH 回归 | `exec vitest run --maxWorkers=1 --minWorkers=1 plugins/ssh/test`，6 文件、57 项通过。包括决定超时、记录在等待期间变化、旧答复与认证阻断，及已有主机认证、目录、SFTP、导入和 Widget。 |
| 静态检查 | `exec oxfmt --check plugins/ssh tests/e2e/ssh`、项目 oxlint、SSH CSS stylelint、颜色／分层／类名／归属／重复 CSS 检查及 staged diff 检查均通过。 |

最终工作台取证。 [首次指纹与四种选择](evidence-task03/first-fingerprint.png) · [第 2 跳密钥变化](evidence-task03/changed-fingerprint.png) · [独立已知主机复核](evidence-task03/known-hosts-reviewed.png)

## 仍未覆盖

- 桌面待答恢复限同一 Engine 实例。Engine 重启、切换 Vault 和 Web 完整刷新后的待答恢复未验收。Web 继续使用受浏览器请求与邀请会话生命周期约束的前台连接。
- 多问、多轮、OTP、OpenSSH CA、哈希与多主机 Known Hosts 条目、以及缺本机身份后的独立恢复界面仍待对应合同。已有缺凭据错误由连接快照反馈。已知主机管理范围为 HUHU 当前使用的单地址普通记录。
- 工作区分栏、三层跳板、真实外部 SSH 主机、其他操作系统及打包安装未验收。

## Modern Web Guidance

使用本机缓存完成 `search` 与 `retrieve`。应用 `dialog` 的原生模态和焦点返回，明确区分退出视图与提交拒绝。应用 `accessibility` 的状态播报和关联标签，以及 `responsive-table` 的语义列头与滚动区域。实际核对了窄窗口首次指纹弹窗、变化指纹弹窗和已知主机列表。


## Lead 核验结果

已核对 Windows 首次信任、准确跳点阻断和独立复核证据，计划整合 4f771358。
