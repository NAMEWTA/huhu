# #7 H2.1 SSH 主机目录后端独立审查

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t4z
- task — task05.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/task05.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/report05.md
- Core — Windows 本机 wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t4z`，清单指向 `task05.md active`。
- 执行结果 — done（复核完成，见合入建议）

## 结论

| 审查轴 | 签收建议 |
| --- | --- |
| 规格 | **有条件通过。** 搜索、选区、分组、排序、并发、重开和授权均已验证。目录路径被同名文件夹占用时，查询误报为首次空目录，需修正读取和保存的错误合同。 |
| 规范 | **有条件通过。** 目录继续由 SSH 所有，复用 HostStore、VaultFiles、能力描述和 #6 授权。共享目录测试仍写死 21 项，候选真实发布 23 项，合入前需同步共享断言。 |

建议仅合入 H2.1 后端目录、组织写入和纯选区函数。先补齐异常路径类型检查及共享目录测试，再签收冻结候选 `38891343ac6e64bcbba642189d07f399a13a91db`。桌面交互的确认与验收仍按 H2.1 UI 切片推进。

## 规格轴

### P2 · 非普通目录文件被误报为首次空目录

在隔离 Vault 内把预期的 `.huhu/ssh/host-directory.json` 放置为同名文件夹，经真实 Engine HTTP 调用 `ssh.hosts.directory`，收到成功、版本 `0` 和空分组。按该版本提交建组时返回 `INTERNAL`。直接调用候选 HostDirectory 和真实 VaultFiles 得到 Windows `EPERM`，同名文件夹保全。根因是 `directory.ts:177–179` 把 `VaultFiles.read()` 的 `null` 当作文件不存在，而 `packages/vault/src/write.ts:41–46` 对目录等非普通文件也返回 `null`。同一份异常数据应在查询和写入前得到可辨认的目录数据错误。本路径建议沿用已有 Vault 路径守卫判定对象类型，仅在路径确实不存在时使用初始版本。 [Engine HTTP 复现](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-http-native.log) · [文件层复现](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/directory-path-native.log)

### 已验证的行为

- **稳定主机 ID、选区与分组。** 候选自带测试及独立 Engine HTTP 探针使用合成 Vault。同名称、地址与端口的不同用户名获得不同 hostId。按名称、用户名、标签、地址端口、多词及 IPv6 可查到预期 ID。右键已选保留去重并过滤陈旧 ID 的选区，右键未选仅产生当前 ID。主组查询含子组，`null` 只返回未分组主机，移动子组后范围随树更新。组自环、祖先环、非空组删除、未知主机及跨组排序均拒绝。 [候选目录用例](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/vitest-focus.log) · [独立 HTTP 探针](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-http-native.log)
- **排序、版本与重开。** 名称正序、倒序、同组全部直属主机的手动排序以及置顶优先通过。首次创建和后续更新分别发出三份同版本 HTTP 请求，均只接受一次，败方返回带获胜版本的 `VERSION_CONFLICT`。关闭并重开同一 Vault，ID、分组、顺序、置顶与目录版本可读回。只读模式可查询，组织写返回 `READ_ONLY_VAULT`。 [独立 HTTP 探针](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-http-native.log)
- **畸形和陈旧引用。** 截断 JSON、错误 schema 版本、重复组、丢失父组、归属指向不存在的组及重复手动顺序，都拒绝查询和整理并保全原字节。通过既有接口删除主机后，目录立即忽略陈旧归属，继续选择该 ID 得到 `NOT_FOUND`，下一次有效组织写清除旧归属和顺序项。 [独立 HTTP 探针](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-http-native.log) · [错误形状复验](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-shape-minimal.log)
- **资料与连接边界。** 目录 DTO 和组织文件未包含合成 `safe://` 引用，查找该引用无结果。整理前后的主机配置逐字节一致，既有桌面 `ssh.hosts.list` 结果与调用形状一致。地址指向隔离回环测试监听器，整个探针接收 SSH 连接数为 0，未产生 `known_hosts`。真实 SSH 未参与。既有 Widget、SSH 编辑器继续读 `ssh.hosts.list`，候选的 12 项 Widget 回归通过。 [独立 HTTP 探针](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-http-native.log) · [Widget 回归](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/vitest-focus.log)
- **真实能力目录与 #6。** 管理目录的 23 个 SSH 能力名与实际 manifest 集合完全相等。新增 `ssh.hosts.directory` 为 read、`ssh.hosts.organize` 为 write，均有输入与输出描述，`exposable: false`。Gateway 的 CLI／MCP／HTTP 判定均拒绝，独立 CLI/MCP 身份的发现列表不含它们，实际调用返回 `CAPABILITY_NOT_EXPOSED`。停用后静态描述保留为 `plugin-disabled`，重启后该状态保留，恢复启用后目录可读。此处验证的是 CLI/MCP 身份经真实 Engine HTTP 的判定和调用。 [独立 HTTP 探针](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-http-native.log)

## 规范轴

- 冻结差异共七个文件。清单增加两项，`capabilities.ts` 同源使用 `directory-schema.ts` 的 Zod 契约，`index.ts` 绑定两个 handler，`directory.ts` 拥有目录状态，`directory-selection.ts` 只产生选区 ID，`directory.test.ts` 从真实 Engine HTTP 验证。文件版本检查和替换在现有 VaultFiles 的同路径队列内执行。组织成功后才发布 `entity.changed`。依赖、共享包和现有 SSH UI 均无差异。 [实现报告](../t88/report01.md)
- **共享回归仍为红灯。** 原样执行候选中的 `apps/engine/test/capability-catalog.test.ts`，第 61、62 行仍断言 21 项，实际返回 23 项，在第 61 行失败。合入时由共享测试所有者按 manifest 比较集合，并保留唯一性、停用与复开断言。独立探针已经核对准确的 23 项集合及停用、复开行为。 [原测试红灯](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/vitest-catalog.log) · [独立 HTTP 探针](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-http-native.log)
- 目录写事件当前采用 `ssh-host-directory`，Workbench 缓存映射仅处理原有 `ssh-host`。后续 UI 接入时需要将目录事件绑定到目录查询刷新，并用新目录的作用域确定 UI 选区。此阶段的现有 Widget 和 SSH 编辑器仍使用原列表接口。

## 候选、验证与未测范围

- 完整候选为 `38891343ac6e64bcbba642189d07f399a13a91db`，直接父提交为 `65bd6eba8bfc3d4fbee268ce395387c77c6d9c1e`。按 SHA 解包，源码 workspace 链接指向归档，第三方依赖来自同锁集成检出。Windows build 26300、Node 24.21.0、Vitest 3.2.7。Git 差异检查和相对 `5beba4c` 的只读合并预览通过。 [环境](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/setup.json) · [归档脚本](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/prepare-archive.cjs)
- 独立运行候选的 2 个目录测试和 12 个 Widget 测试均通过。首轮附带的 Vault operations 因归档遗漏 crash 子进程夹具有 5 项失败，补入同 SHA 夹具后的补充 Vitest 运行超时。静态目录另一份测试样例的自动复跑也超时。同一闭环改由独立真实 Engine HTTP 探针验证，包括目录存储、版本冲突、原样失败、能力名集合与停用重开。t88 另记录候选的 27 项全通过和修订数量后共享回归的结果。 [首轮](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/vitest-focus.log) · [补充运行](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/vitest-recheck.log) · [独立 HTTP 运行](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-http-native.log) · [t88 报告](../t88/report01.md)
- 独立证据与探针保存在 `D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4`。归档内通过 Node 的类型转换和本地模块解析运行冻结 Engine，仅使用合成 Vault、合成引用、回环 HTTP 和合成主机端口。预期的异常已按实际接口证据确认。 [独立探针](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/engine-http-probe.mjs)
- SSH 原型六个文件指纹为 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`，与记录匹配。用户确认记录仍待确认。列表/网格、折叠、拖放、右键反馈和多选禁用是待确认的 UI。真实 SSH、PTY、SFTP、部署包和原生 CLI/MCP 传输未执行。 [指纹输出](D:/Document/code/huhu/temp/issue-baseline/t4z-h21-3889134-Fk2zs4/prototype-fingerprint.log) · [原型确认记录](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-7-ssh-module/prototype-review.md)

## 阻碍与接续

独立审查已完成。建议补齐非普通目录路径错误与共享能力目录断言后合入 H2.1 后端。业务和用户现有改动全程只读。

## Lead 验收

由 Lead 核验后追加。
