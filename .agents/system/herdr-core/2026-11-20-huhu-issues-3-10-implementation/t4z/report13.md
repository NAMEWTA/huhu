# #9 P1.1 当前格式 Safe 密钥环与解锁代独立复核

- terminal_address — t4z
- task — task13.md
- Core — Windows 本机 wta，`346bd5608735e3fcb27f9d01f5c8008e`，0.1.21。
- 执行结果 — done。建议签收 P1.1 的 Engine 密钥环、解锁会话和过渡兼容切片。
- 冻结候选 — `6b11b63cb6cfae8b2a2f0effe5d64657a203496f`，直接父 `64788547141e806f5134fff7290b0d44bfa68b5c`，树 `39503b169892f4d1e553d923bb43e87b68a1c274`。 [P1.1 规格](../../../../dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P1.1-master-session.md) · [t12p 交付](../t12p/report01.md)

## 规格轴

| 场景 | 独立实测 |
| --- | --- |
| 初始化、锁定和解锁 | 空库并发设置只发布一次。重开进入锁定状态，用成功设置的原密码解锁，`generation` 从 0 变为 1。锁定状态下的秘密操作返回 `SAFE_LOCKED` 并给出解锁入口。 |
| 离开、切 Vault、停用与关闭 | 真实桌面 HTTP 入口验证，关闭离开锁定设置时离开无变化，启用后离开发生锁定并推进代次。打开另一合成 Vault 后切回原库，原库保持初始化和锁定设置，以新 `instanceId` 启动并需重新解锁。停用插件或关闭 Engine 时，仍在派生密钥的解锁收到 `SAFE_LOCKED`；重新启用或重开后可正常解锁。领域用例另证实旧会话的迟到读写被拒。 |
| 无操作与错误主密码 | 受控时钟验证空闲自动锁定、操作重置计时和手动锁定清理定时器。当前 Safe 实例连续五次错密进入 30 秒冷却，期满可再试。 |
| 注入写失败与损坏保全 | 注入第二份文件写失败，当前目录未发布，状态仍为空库，重试一次成功。改密暂存完成但发布前手动锁定，得到 `SAFE_LOCKED`，旧 keyring 逐字节保留并可用原密码解锁。损坏 keyring 或 manifest 时状态报损坏并保全原字节，重开 HTTP 结果可定位 `manifest.json`。 |
| 过渡格式 | 合成旧 keyring 可解锁，既有字节不变且不生成 `current`。新初始化一次发布 `current/keyring.json` 和 `current/manifest.json`，均为 format 1，共用 `vaultKeyId`，空清单 revision 为 0。过渡期 `safe.items.*` 仍能与当前密钥环一起工作。 |
| ZIP 与真实 Windows 模块凭据 | 真实 Engine 导出并导入新目录，导入分配新 Vault ID，原主密码可解锁，合成笔记和用例覆盖的密文哈希一致。真实 Windows Credential Manager 回归另确认 Safe 锁定时源 Vault 的模块凭据在重开后仍可取用。同机恢复即使保留可移植 Vault ID 也得到不同本机实例，模块标记 `needs-reconfiguration`，读返回 `unbound`，该 ZIP 未发现合成模块凭据明文。 |

[本轮独立日志](evidence-task13/independent.log)

## 规范轴与后续验收

- `SafeStore` 在 `.huhu/cache` 写入两份暂存文件，发布前核对会话和原状态，再以同卷目录重命名一次发布。通用 ZIP 收集排除 cache，纳入已发布的 Safe 文件。包装与清单认证绑定可随备份带走的 `vaultKeyId`，因此导入发放新的 Vault ID 后仍能解锁。现有 ZIP 用例验证普通恢复。P8.1/P8.2 的跨写入同代快照、改密前后分包以及新账号和标签逐项恢复仍需各自验收。 [P8.1](../../../../dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P8.1-backup-contents.md) · [P8.2](../../../../dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P8.2-restore-new-vault.md)
- 在已复跑的普通 Engine 场景中未发现签收阻断。真实窗口即时清理旧缓存和显隐状态尚待接线。当前 `safe.status` 已提供 `instanceId`、`generation` 和 `corruptFile`，共享锁定事件与 Renderer 联验仍待完成。典型待验场景为用户正在查看 Safe 时，从另一入口锁定，当前窗口应即时清除旧内容并丢弃晚到的结果。本轮 Engine 已验证迟到操作拒绝，未运行实际窗口缓存路径。 [t12p Renderer 接线说明](../t12p/report01.md)

## 验证与清理

Windows x64、Node 24.21.0、Vitest 3.2.7。独立 Git 归档仅运行冻结树已有用例，**19 通过、57 项按名称过滤跳过**，覆盖 4 个测试文件。实际 Vault、密码和模块记录均使用夹具的合成输入。差异检查通过，归档已清理，验证 pane `t139` 已退出并移除。 [复跑日志](evidence-task13/independent.log) · [归档脚本](evidence-task13/frozen.ps1) · [清理记录](evidence-task13/cleanup.log)
