# #9 Windows 系统凭据适配与安装包接线预审

- 终端 `t4z`，结束后写同目录 `report07.md`。仅 Windows，本机工作树和远端只读，四个 Git worktree 已满，请勿创建新 worktree。不要读真实用户凭据或 Vault。
- 复用 `../t1b` 的 P0.3 报告、`temp/issue-baseline/credentials-evidence` 已保全的 Node/Electron 实机探针、当前内核 `ModuleCredentials` 与 Issue #9 规格。确认候选 `@napi-rs/keyring@2.1.2` 此版本的 API、Windows native optional 依赖、错误正规化、同一实例目录与 Vault 范围等条件。重点核对 Linux/macOS 未参与的情形应如何在代码中保持清晰可诊断行为。
- 对照现有 Electron Vite、ASAR `asarUnpack`/打包过滤、UtilityProcess 路径、pnpm 锁与已验证的本机依赖来源。给出当前最小接线面及能真实证明系统凭据写/读/删除、同 Vault 重开、Safe 锁定、外来恢复以及包内不存在明文的证据设计。只用现有实机结果或合成随机标识测试，结束清理自己创建的合成项目。不得修改业务源码、共享锁、用户系统设置或实际密钥。
- Lead 正在运行 #6 真实构建。独立报告提供实际读到的源码行与可复查日志，区分软件路径、原生运行和未验证打包，勿打断集成构建。
