# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t211
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/task01.md
- 回执文件 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/herdr/t211/report01.md
- 业务验收报告 — Inventory 的 040-s2、041-s3、042-s4、090-s5、099-s6、105-s7 及 SSH Change 的 H 票同名 evidences，由 Lead 回写。
- 执行结果 — blocked（40 票核对与 8 个切片交回，#7 整体待继续）

## 成果与运行指针

- 工作目录 — /home/wta/projects/huhu/.agents/dev/worktree/inv-w1，分支 `inv/w3`，基线 `445d340086b089d1a9f96eb2d1fef1e1c3da3697`。
- 40 票逐项核对已交回 Lead。[核对稿](../../runs/t211/task01/h-audit.md)
- 派发开始时核对到 `HC_TERMINAL_ID=t211`、原 manifest 指针 `t211 / task01.md / active`。Lead 随后把派发和回执迁到忽略目录，原 manifest 行已移除，本轮沿用已开始的任务。业务改动在 worker 检出；核对稿与回执位于派发单指定的忽略目录。

分支提交（HEAD `e3cac81e`）

- `d4b189cf` feat(ssh): restore local identity from OpenSSH sync (H3.4)
- `a5536b28` feat(ssh): bound proxy share CONNECT headers (H3.5)
- `8e7ec22f` test(ssh): exercise a real Linux full-screen pager (H5.1)
- `9f76ca56` test(ssh): verify two selected shortcut targets among three panes (H5.2)
- `457c27ae` test(ssh): reopen the original Linux local shell (H5.4)
- `fda4bec8` feat(ssh): keep remote indentation within the selected lines (H6.3)
- `073ad55d` test(ssh): cover directory following with Linux Zsh (H6.4)
- `e3cac81e` test(ssh): verify native server tool window ownership (H9.3)

| H 票 | 改动与结果 | Lead 的 Playwright 用例 |
| --- | --- | --- |
| H3.4 | `plugins/ssh/src/{engine,shared}/config-sync.ts`、`ui/ConfigSyncPanel.tsx`。失效的本机身份文件引用可从用户选取的 OpenSSH 文件恢复。保活等字段仍可预览，无法读取的身份引用不会反向写入源文件。回归在 `plugins/ssh/test/draft-and-keys.test.ts`。 | `tests/e2e/ssh/import.spec.ts`「H3.4 OpenSSH 同步预览双向差异并保留命令文本」 |
| H3.5 | `plugins/ssh/src/engine/proxy-share.ts`。只把截至头部终止符的数据计入 CONNECT 响应头的上限；真正的超限头和代理认证拒绝仍失败。回归在 `plugins/ssh/test/draft-and-keys.test.ts`。 | `tests/e2e/ssh/forwarding.spec.ts`「H3.5 桌面代理分享复制配置并在测试失败和停止后清除成功状态」 |
| H5.1 | `tests/e2e/ssh/remaining.spec.ts`。Linux `script` 提供真 PTY，`less` 进入备用屏并显示宽字符，退出后核对原屏幕和同一 SSH 会话。 | 「H5.1 SSH Linux 真实分页器显示宽字符并还原原终端画面」 |
| H5.2 | `tests/e2e/ssh/shortcuts.spec.ts`。既有流程扩展为三个实际分栏，验证仅选中两栏接收文本和显式回车，第三栏保持零输入。 | 「快捷文本排序持久化，预览仅向显式选定的可输入分栏交付」 |
| H5.4 | `tests/e2e/ssh/settings.spec.ts`。停用 Agent CLI 后进入 Linux 本机 sh，通过 `test -t 0` 和真实回显验证 PTY。将新会话默认值改为 bash，旧终端仍按原 sh 重连。用例恢复原设备偏好。 | 「H5.4 Linux 本地终端在停用 Agent 后用原 Shell 重连」 |
| H6.3 | `plugins/ssh/src/ui/RemoteTextEditor.tsx`。选区终点与下一行的起点重合时，仅缩进选区实际覆盖的行。现有远端编辑用例新增该断言。 | `tests/e2e/workflows/ssh-workspaces.spec.ts`「H6.3 远端编辑保持权限和文本格式，版本冲突保留两份内容」 |
| H6.4 | `tests/e2e/workflows/ssh-workspaces.spec.ts`。沿用 Bash 夹具，增加 Linux Zsh 启动脚本变体，覆盖双向导航与忙碌、全屏时跳过。支持用 `HUHU_TEST_ZSH` 指向实际可执行文件。 | 「H6.4 工作台仅让原空闲 Bash 跟随，输入和切换分栏使导航授权失效」「H6.4 Linux Zsh 的目录跟随跳过忙碌和全屏状态」 |
| H9.3 | `tests/e2e/ssh/monitoring.spec.ts`。独立回环夹具覆盖 A/B 窗口固定原始 Shell、再开 A 聚焦、缺 Docker 和权限拒绝、关闭 B 仅取消其进行中的查询。 | 「H9.3 原生服务器工具复用原窗口并只取消自身查询」 |

## 已运行验证

验证命令使用 Node 24.22.1，每项均持 `/home/wta/projects/huhu/temp/dev/verify.lock`。

- `pnpm --workspace-concurrency=1 --filter "./vendor/*" run build:types` 通过，三个 vendor 包串行生成类型声明。[日志](../../runs/t211/task01/vendor-types.log)
- `pnpm exec vitest run plugins/ssh/test/draft-and-keys.test.ts` 初次及复查均为 10/10。复查在修正类型推断后运行。[复查](../../runs/t211/task01/draft-and-keys-recheck.log)
- `pnpm --filter @huhu/plugin-ssh run typecheck` 初次发现同步差异状态从联合类型变宽为 string。补上返回类型后复查零错误。[初次](../../runs/t211/task01/ssh-typecheck.log) · [复查](../../runs/t211/task01/ssh-typecheck-recheck.log)
- 11 个改动的 `.ts` 文件通过 `node --check`，`git diff --check 445d3400 HEAD` 无输出。工作树干净，本次验证用 Core 终端已移除。

## 未运行的验证

- 上表 Playwright 用例由 Lead 运行。Linux 本机未发现 `zsh`，实际 Zsh 用例需具备该 Shell 的 Linux 环境。
- Windows、macOS、WSL、PowerShell、.NET、真实外部 SSH 主机、外部服务、系统级中文 IME 和硬件输入协议未实测。
- 本 worker 未跑构建、打包、全仓类型检查、全仓 lint、knip、全量单测或截图验收。

## 阻碍与接续

- H1.1 的实际采用项台账及制品许可由 Lead 维护。S1 选定单一 ssh2 执行层，旧 Go 候选与已选架构冲突。H12.2 的 Linux 包与缺件反证需要 Lead 同候选验收。
- H3.1 的本机身份丢失后的交互式恢复、其他 CA 算法及 KRL 仍待按支持范围决定并实现。H3.4 仍为单字面 Host、单身份文件的显式预览与确认流程。
- H4.3 的活动终端跨窗口交接仍待实现。现有文件和服务器工具的窗口只绑定原会话，终端交接需要明确定向转移输入控制、处理目标窗启动失败并保留已有历史。
- H5.1 系统 IME 与图像/键盘协议、H5.2 的持续键入广播仍缺交付。已覆盖的快捷文本广播另见用例。
- H9.1 的 Web 读仪表盘沿用 S5。Web 活动 Pane 采样仍受现有会话所有权限制。H9.3 的 PID + 命令名保护仍缺启动时间佐证。
- H10.1、H10.2 原 §11 的未覆盖偏好仍待逐项核实与实现。H12.1 的异常执行进程退出和新格式备份恢复需同候选验证。逐票边界保留在核对稿。

## Lead 验收

