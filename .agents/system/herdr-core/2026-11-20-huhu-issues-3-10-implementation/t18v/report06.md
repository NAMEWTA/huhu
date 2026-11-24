# task06.md · #7 SSH 绑定文件会话与并发文本编辑

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task06.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task06.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report06.md
- 执行结果 — done
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — impl/huhu-issues-3-10-production-cutover
- 基线 — 7ae257b2772a178d3b5821b7b862f31ff3b047f9
- H6.1 提交 — 8ff3549b7e86f5ff4677a9f0af4be230ef8a5e2e
- H6.3 提交 — 1f7ceec859c167ad5019e7a7857c5ea3467af97c
- 本地 integration 核对候选 — 0d279330e2adf48106a50411ccf40b7296d93675
- 候选父提交 — 0c96c27b844a580178a4d6f24f1d6bb987eba4e7

## 结论

H6.1 先经真实 Windows Workbench 验证并提交。附属面板随所选分栏或主机连接打开，独立文件视图固定源 Shell、文件会话 ID 和 SSH 连接 ID。本机和远端有各自的目录及导航。重新连接同一主机后，旧视图仍显示原连接已断开，旧 ID 的远端请求被拒绝。关闭文件视图时原 Shell 可以继续运行。

H6.3 在该绑定上接入 Workbench 的 UTF-8 文本编辑。保存按原路径、原字节及权限校验版本，写入暂存后再次核对。冲突时保留编辑草稿和远端新内容，可并排读回。正常替换保留测试文件的 0640 权限、BOM 和 CRLF。

## 产物与改动

- 实现位于 plugins/ssh。沿用现有 SFTP 能力、连接生命周期和 Windows preload 的文件／目录选择桥。
- 对照已确认 #7 原型及本地 Motty main@2daa9db582e16edf60a60b7ada26f47f808f973c 的 internal/sftpclient/walk.go 和 text.go。
- 两提交的 Windows 取证入口为 tests/e2e/workflows/ssh-workspaces.spec.ts，证据为 .agents/dev/changes/2026-11-19-issue-7-ssh-module/verification 下的 H6.1-file-session-windows.md 和 H6.3-text-edit-windows.md。
- 本地候选使用 integration 已提交树解析 SshManager、SshModule 两处重叠，保留原 promptId 状态机、主机编辑及信任恢复入口。候选只改 SSH、专属测试和证据；校验了冲突文件的 TypeScript 语法及 Git 差异。集成工作树和工作分支均未由候选生成过程改写。

## 验证

| 要求 | Windows 实测 | 证据 |
| --- | --- | --- |
| H6.1 面板来源与目录操作 | 从甲打开独立双栏后切乙，附属栏显示乙的标记；独立栏仍读甲并保留原 Shell 和原目录。真 preload／主进程 IPC 请求 openDirectory，测试替换系统对话框返回值。两侧可导航、交换，远端属性、返回、书签、排序及筛选通过。 | H6.1-file-session-windows.md |
| H6.1 搜索、断线和关闭 | 搜索命中只定位目标行。夹具挂起实际 READDIR 时可取消；同主机重连生成不同连接 ID，旧 ID 返回 SSH_DISCONNECTED。单独关闭乙的独立栏后，原 Shell 仍为 running。 | H6.1-file-session-windows.md |
| H6.3 编辑与并发 | Workbench 查找替换、跳行、缩进、保存后回读原始字节和权限。第二个真实文件会话写入后旧保存冲突，保留草稿和新版。暂存期间外部修改也被检测，暂存文件清除。超限与无效编码分别提示。 | H6.3-text-edit-windows.md |
| 工作分支门禁 | Windows Electron 构建及 Workbench E2E 5 项通过，含 H4 的 3 项回归。SSH Vitest 56 项、插件 TypeScript、改动源码 lint、文件面板 CSS 和 Git 差异检查通过。 | playwright test tests/e2e/workflows/ssh-workspaces.spec.ts --workers=1；vitest run --no-cache --pool forks --maxWorkers 1 plugins/ssh/test |
| integration 候选 | 用候选树文件覆盖编译读取，合入的两个 SSH 冲突文件均被编译读取，SSH 文件没有诊断。跨模块检查有 15 项 Mail／Engine 诊断，包括本工作树缺少 integration 的 Mail 导出与依赖，候选的整体验证仍待集成环境。 | 候选及父提交见报告头 |

## 阻碍与接续

H6.1 采用 Workbench 独立视图，绑定随 Engine 退出结束。H6.3 使用内置远端编辑器。现有桌面外部打开桥仅支持受管本机路径，尚缺经验证的远端账户和路由适配器。SFTP 的版本核对与 rename 分开，独立客户端在最后核对和重命名之间的写入没有服务器级比较交换保证。无额外 worktree、真实远端或测试 pane。工作树干净。

## Lead 验收

由 Lead 追加。
