# task05.md · #7 SSH 工作区模板与可重开的局部启动

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task05.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task05.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report05.md
- 执行结果 — done
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — impl/huhu-issues-3-10-production-cutover
- 实施基线 — 3f479b899d67000d26ba95f0f069a39aa86569df
- H4.1 提交 — 14a95f7fa91a83f98cd8e1b25b9a529ca5818596
- H4.2 提交 — 7ae257b2772a178d3b5821b7b862f31ff3b047f9

## 结论

H4.1 通过真实 Windows Workbench 回归后独立提交。模板从已有 SSH 主机目录选取 1–12 台主机，保存顺序、六种预设或自定义分割树，以及可选的每分栏登录命令。保存、重命名、同 Vault 重启后打开和删除在 Workbench 中完成。删除仍被模板引用的主机会得到模板名和解除引用提示，旧修订会被拒绝。

H4.2 在完整运行绑定原子写入后，复用 SshManager 分别建立连接和 Shell。主机密钥确认可在重挂后读回，失败只归入对应分栏。模板记录稳定主机 ID 及目标摘要。拨号前核对账户、地址、端口和跳板顺序，管理凭据沿用现有租约内配置校验。模板和本机运行绑定文件均没有认证字段、活会话或终端输出。

## 产物与改动

- 实现集中在 plugins/ssh，真实应用验收在 tests/e2e/workflows/ssh-workspaces.spec.ts。工作树干净。
- 模板使用 .huhu/ssh/workspace-templates.json。运行绑定使用独立的 .huhu/runtime/ssh/workspace-runs.json，现有 Vault 打包收集器排除 runtime。
- 对照已确认原型及本地 Motty main@2daa9db582e16edf60a60b7ada26f47f808f973c 的 internal/workspace/spec.go 和 internal/workbench/workspace_launch.go。
- 证据目录 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence

## 验证

| 验收要求 | Windows 实测 | 证据位置 |
| --- | --- | --- |
| H4.1 模板 | 六个预设和自定义树可预览。应用重启保留改名、排序和自定义首区比例。重复、超限、叶数不匹配及额外认证字段被拒绝。模板引用阻止主机删除；模板删除后主机可单独删除。 | H4.1-workspace-template-windows.md |
| H4.2 部分成功与信任 | 三台回环主机中两台已连接，第三台在完成信任后拒绝认证，两条成功会话仍可切换。切离再开可取回尚待信任的指纹。真实终端 WebSocket 收到夹具输出，登录命令随新 Shell 发送一次，重挂保留同一会话 ID。 | H4.2-workspace-launch-windows.md |
| H4.2 保存、重开与目标归属 | 临时运行可存模板，启动模板生成新运行 ID。应用重启后显式重连取得代次 2 和新 Shell，保留 Pane ID。绑定写入故障保留草稿，运行列表和连接审计为空，夹具零连接。被删除、已变更和不可达的目标独立显示错误。 | H4.2-workspace-launch-windows.md |
| 回归 | Electron 44.9.1 构建和 Workbench E2E 3 项通过。SSH Vitest 56 项、插件 TypeScript、改动源码 lint、CSS 检查、格式和 Git 差异检查通过。 | playwright test tests/e2e/workflows/ssh-workspaces.spec.ts --workers=1；vitest run --no-cache --pool forks --maxWorkers 1 plugins/ssh/test |

## 阻碍与接续

本切片无交付阻碍。模板依赖采用先解绑再删除，已覆盖两条主机删除能力。Q7-1 的路由、转发及统一依赖预览仍需核对。重启通过用户显式重连进入新代次。关闭运行释放所属 Shell，共享传输由原 SSH 管理器管理。H4.3 的分栏移动、换窗及单分栏回收，包级联验和其他平台由后续切片验证。仅使用 Windows 临时 Vault 和本机回环夹具，t18v 保留。

## Lead 验收

由 Lead 追加。
