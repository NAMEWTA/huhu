# #7 H2.1 主机目录后端报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t88
- Core — Windows wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t88/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t88/report01.md
- 执行结果 — done
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/ssh
- 分支 — `impl/huhu-issues-3-10-ssh`
- 基线 — `65bd6eba8bfc3d4fbee268ce395387c77c6d9c1e`
- 本地候选 — `38891343ac6e64bcbba642189d07f399a13a91db`

## 结论

H2.1 的目录查询、批量组织和选区目标解析已交付。通过已配置的 GitHub 来源核对 H02、H03、A01，再对照 H2.1、规格、设计以及本地 Motty `host_catalog.go` 和 `host_catalog_test.go` 的分组与选择行为。实现复用了 Huhu 的 HostStore、SSH 能力注册、#6 Dispatcher 和 Vault 条件写入。[Issue #7](https://github.com/NAMEWTA/huhu/issues/7)

## 产物与契约

- `ssh.hosts.directory` 将当前 Vault 的 HostStore 记录和组织信息合并。每条主机结果含 `hostId`、名称、地址、端口、用户名、标签、分组和置顶状态。查询词按空白拆分并忽略大小写，可跨字段匹配。省略 `groupId` 查询全部，`null` 查询未分组主机，指定组 ID 查询该组及其子组。分组列表含稳定的组 ID 和父组 ID。
- `ssh.hosts.organize` 接受 `expectedVersion` 和单项操作，支持建组、改名、移组、删除空叶组，以及按主机 ID 批量移动、置顶和取消置顶。手动重排提交同一组全部直属主机的 ID，自动排序支持按名称正序或反序。置顶主机始终排在前面。删除分组前须移出其中的主机和子组。
- `.huhu/ssh/host-directory.json` 保存分组、归属、置顶和手动顺序。组织版本初始为 `0`，每次成功提交生成新版本。版本旧时返回 `VERSION_CONFLICT` 和 `currentVersion`。共享目录文件使用 VaultFiles 原子条件写入，操作从最新版本中保留其他组织记录。写入成功后发布 `entity.changed`，其 `kind` 为 `ssh-host-directory`。
- `resolveHostTargets` 按有效主机 ID 去重解析选区。右键已选项沿用当前有效选区，右键未选项只产生该主机 ID。现有 SSH 编辑器和 Home Widget 继续使用 `ssh.hosts.list`。新增两个能力沿用现有 SSH 的桌面调用授权和静态描述。
- 提交仅含 `plugins/ssh` 下的 engine、私有 schema、manifest 和测试，共 7 个文件。提交后工作树干净。

## Windows 验证

| 验收项 | 实际结果 |
| --- | --- |
| 合成主机与搜索 | 用真实 Engine 的 `POST /api/v1/call` 保存四台合成主机。同名同地址同端口的 alice 和 bob 分配了不同主机 ID。名称、用户、标签、组合词、地址端口和 IPv6 搜索均返回预期 ID。 |
| 选区与组织 | 主机 ID 去重，右键目标解析符合 H03。改名后目标组 ID 保持可用。批量移动只影响给定主机。自环、祖先环、非空组删除、缺少主机和跨组重排被拒绝。检查了子树查询、正反序、手动顺序及置顶。 |
| 冲突与坏文件 | 首次建档和已有目录的两个并发请求各产生一个胜者与一个 `VERSION_CONFLICT`，冲突提供胜者版本。非法目录 JSON 的查询和写入均返回 `INVALID_INPUT`，文件字节保全。 |
| 重开、授权与资料 | 关闭 Engine 后用同一路径重开同一 Vault ID，分组、顺序、置顶与版本一致。组织操作期间四份主机配置逐字节一致。目录查询与组织文件只含目录资料，搜索认证引用无结果。CLI/MCP 请求被 #6 拒绝，插件停用时保留静态描述。已有主机保存、列表与删除路径在隔离 Vault 实测。SSH 连接数为 0。 |
| 工具结果 | Node 24.21.0，pnpm 12.10.1，Vitest 3.2.7。3 个测试文件共 27 项通过，其中目录 HTTP 2 项、SSH Home Widget 12 项、Vault operations 13 项。SSH 插件类型检查、目标文件格式与 lint 检查、Git diff 检查均返回 0。 |

可在候选工作树复测。先按仓库约定安装依赖并为 `vendor/cosmokit`、`vendor/cordis`、`vendor/timer` 生成类型。

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 plugins/ssh/test/directory.test.ts plugins/ssh/test/home-widget.test.ts packages/vault/test/operations.test.ts
node node_modules/typescript/bin/tsc --noEmit -p plugins/ssh/tsconfig.json
```

隔离测试 Vault 和临时兼容探针已清理。依赖安装及验证的命令 pane 已关闭。

## Lead 集成与体验边界

- `apps/engine/test/capability-catalog.test.ts` 第 61、62 行把 SSH 能力数固定为 21。真实 Engine 现在返回 23，原用例在首个数量断言失败。在 SSH 测试目录临时复刻该用例并把两个预期更新为 23 后，完整的停用、重启与重新启用用例通过。共享测试文件由 Lead 更新，集成时可用 SSH manifest 核对实际能力名。
- 待原型确认的产品体验包括右键动作、列表与网格、分组折叠、拖放及反馈。本候选的验收点是后端目录、显式主机与分组 ID 和纯选区函数。

## Lead 验收
