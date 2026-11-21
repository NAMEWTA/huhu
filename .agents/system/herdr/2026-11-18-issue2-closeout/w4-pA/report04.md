# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pA
- task：task04.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task04.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report04.md
- 执行结果：done

## 结论

从富文本斜杠菜单选择“表情”会打开离线选择器。真实 Electron 测试通过键盘插入 🎉、鼠标插入 🚀，核对保存后的 Markdown 字节和重开后的正文。Escape 关闭选择器并恢复编辑器焦点。四路并行 12 次均通过。交互测试只排除 Vault 自身的回环 IPC，其他请求为 0。36 项斜杠菜单逐项测试也确认选择器出现并实际插入表情。

壳层排查补接了正文标签弹窗、富文本选区到源码的定位和编辑器操作提示。原有 YAML 图标选择器也共享离线字典，源码模式可保存图标并保留正文。五个专项 Electron 用例均通过。上游挂载点、Huhu 的可达入口、已有验证和适用范围见 `shell-mounts.md`。最终知识库全量以 `--retries=2` 运行，退出 0。61 个用例首次通过，1 个格式气泡选区用例重试通过，1 个按配置跳过。

## 产物与改动

- 工作目录为 `/home/wta/projects/huhu-wt-parity`，分支为 `closeout/issue2-parity`。从 `c80391c` 接续，最终提交为 `16581bef17becbbdf72b5c0b2df0ac0fb3c6e2d4`，工作树干净。
- 功能提交 `2abe8a2` 复用固定上游 `44a2e0a` 的选择器、标签弹窗和源码定位机制。原样迁入表情 DOM 用例，vendor 变更登记在 `PATCHES.md`。Frimousse 保持 0.3.0，离线字典钉到该版本声明的开发字典起始版本 16.0.2。笔记侧按 task02 的编辑器装配范围，在 `NoteDocument.tsx` 和 `NoteEditorSurface.tsx` 接入既有模式状态与标签索引。
- `0fd2b55`、`aae8bc4`、`ecd9616` 分别修正目标标签重开、实时生效的 Embed 属性和系统文件选择器的验收夹具。最终证据同步到 `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/` 下的 `shell-mounts.md`、`parity-82.md`、`runs.md`。
- 重启后核对了 Git 已提交和未提交状态、根 `test-results` 及 editor 上游 JSON。重启前没有 task04 提交，代码仍在工作树。缺终态的类型检查和上游单测已重跑并取得完整结果。

## 验证

日志基目录为 `/tmp/huhu-parity04-Iw7xbq/`。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 表情插入与离线验收 | 四路各 3 次，12/12 通过 | `emoji-pressure-1.log` 至 `emoji-pressure-4.log` |
| 壳层专项和菜单覆盖 | 5 个专项通过，36 项逐项通过，页面错误记录为空 | `e2e-knowledge-retry.log`、`matrix-delivery.log` 和测试输出内的 `slash-matrix.json` |
| `pnpm typecheck` | 退出 0，重启后完整检查通过 | `typecheck-resumed.log` |
| `pnpm lint` | 退出 0 | `lint-delivery.log` |
| `pnpm test` | 退出 0，859 通过，1 跳过 | `test.log` |
| `pnpm test:vendor` | 退出 0，291 文件通过，6,015 用例通过，4 跳过。表情上游 DOM 共 6 项通过 | `test-vendor-serial.log`、`emoji-dom.log` |
| `node scripts/ok-patches.mjs --check` | 退出 0，登记 205 项，未登记和多余登记均为 0 | `patches-delivery.log` |
| `pnpm build` | 退出 0 | `build-resumed.log` |
| `pnpm format:check` | 退出 0，665 个文件符合格式 | `format-check-last.log` |
| `pnpm knip` | 退出 0，留有两条已有配置提示 | `knip-delivery.log` |
| `pnpm notices` | 退出 0，生成 1,402 项，新增字典和其 peer 均为 MIT。生成物留在日志目录 | `notices.log` 和同目录的 `THIRD_PARTY_NOTICES.md` |
| `xvfb-run -a pnpm e2e tests/e2e/knowledge` | 默认配置的完整运行是 59 通过、3 失败、1 跳过。修正文件项夹具后，全套以 `--retries=2` 复验退出 0，61 首次通过、1 重试通过、1 按配置跳过。F10 泄漏用例跑满 200 轮 | `e2e-knowledge-verified.log`、`e2e-knowledge-retry.log` 及相应 trace |

## 阻碍与接续

最终完整复验已通过，保留波动记录供 Lead 验收。默认运行曾出现批注偏移不变和关应用时笔记仅保存部分输入，两项均在最后全量首次通过。最后全量的格式气泡用例首次读到空选区，第一次重试通过，Playwright 标为 flaky。大 Vault 用例由现有开关控制，本次沿用默认跳过。重启后上游首次全量的依赖产物扫描超时，单项和完整套件的后续重跑均通过。具体失败记录与退出码均在 `runs.md`。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过**。表情选择器和 3 个壳层入口都已补齐，有 e2e 证据。“关应用时只保存部分输入”的原因是本分支还没合入 w4:pC 的 C06 修复（在 closeout/issue2-session 上，已集成到 03dc93b）；task05 开工前先合入集成分支，之后复核。
