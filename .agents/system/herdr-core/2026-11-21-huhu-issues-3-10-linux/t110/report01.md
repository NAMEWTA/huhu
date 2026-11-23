# P10.2 候选 AppImage Git 凭据用例

Lead `t3p`，任务 `t110/task01.md`，工作树 `agent-linux`，任务基线 `4ae7e7e4`。用例已编写，待 Lead 串行运行。

## 交付

- `tests/e2e/workflows/git-credentials-package.spec.ts` 中新增一项「P10.2 候选安装包：Safe 锁定及停用后 Git 按远端绑定使用认证」。仅在 `HUHU_GIT_PACKAGE_ACCEPTANCE=1` 时启用。
- 用例通过 `openCandidateDesktop` 从带 SHA-256 与完整提交身份的 AppImage 提取并启动桌面。夹具记录桌面与随包 Engine 的可执行路径、进程及 Vault 身份，并在业务调用结束后再次核对 Engine。按 P4.1 和桌面打包装配，Versioning 通过系统 `PATH` 使用 Git。候选包提供 Engine，Git 使用真实系统程序。
- Safe 未设置时，通过桌面 Versioning 设置保存合成认证并推送笔记。在 Safe 锁定及停用后，分别从同一 HTTPS 目标拉取一个独立的新提交。用例检查每阶段的认证请求、本地 Git HEAD 和笔记内容。
- 将目标改为同端口另一仓库，再改为另一端口的同名仓库。两次均断言 `needs-reconfiguration`、`GIT_AUTH_FAILED`、两服务零新增请求及目标分支无提交。为第二端口保存另一组认证后断言推送成功。清除认证后，第二服务只收到未认证的 fetch 请求，返回 `GIT_AUTH_FAILED`，本地与远端的分支头保持原提交。
- `tests/e2e/helpers/git-auth-fixture.ts` 和现有 Engine 集成用例使用同一回环证书和 `git http-backend` 方式，记录认证是否匹配，并在清理时关闭 HTTPS 服务和回收 CGI 进程组。凭据、Vault 和 HOME/XDG 使用夹具隔离。候选包 helper 要求私有 D-Bus wrapper。证据附件记录脱敏请求、提交和候选身份，清理保留原始异常。

## 未运行的验证

未运行 Playwright/Electron E2E、单元测试、lint、类型检查、构建、打包、安装或 GUI 验证。未暂存、提交或启动子代理。待 Lead 将上述单一用例接入 wrapper，在干净组合提交对应的 AppImage 上运行。
