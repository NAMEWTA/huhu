# fix3 · 三项阻断收口

- 共享根：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout`
- pane_id：`w5:pG`
- 清单任务：`fix3/task01.md`
- 任务文件：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/fix3/task01.md`
- 报告文件：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/fix3/report01.md`
- 执行结果：`done`

## 交付

在 `/home/wta/projects/huhu-wt-fix2a` 的 `closeout4/fix2a` 执行 `git merge --no-ff closeout4/fix2b`，退出 0，无冲突。合并提交 `9bb822dc` 的父提交为 `5c25b77b` 和 `e3c97dac`。最终提交 `67ca69eb`，工作树干净。

## 三项阻断的红绿证据

合并现场已含候选实现和部分回归测试。新增 NotesService 改名回归后，逐项临时恢复故障行为，运行同一测试判红并恢复候选实现。红灯修改均已撤回。转绿使用下节的定向套件及夹具修正后的两次复跑。

| 阻断 | 红灯（退出 1） | 绿灯（退出 0） |
| --- | --- | --- |
| A07/A08 并发改名 | 用覆盖式 `renameSync` 替换最终提交。普通改名、大小写第二跳和 NotesService 带双链改名三例均意外成功。 [红灯日志](/tmp/huhu-fix3/red-rename.log) | 最终一步由原生独占移动发布。撞名后保留竞争文件及原件，NotesService 回滚已改写的双链。大小写别名占住原路径时，日志标记 `needs_attention` 并保留暂存原件。 |
| F02 编码转换 | 临时跳过搬离原件后与预览字节的比较，NotesService 在外部替换后仍返回转换成功。 [红灯日志](/tmp/huhu-fix3/red-encoding.log) | 目标被搬入恢复目录后按实际字节比较，提交使用独占发布。外部更新仍在 Vault 原路径，预览原字节与相对路径记录保存在 `.huhu/operations/encoding-recovery/`。另测发布前竞争者重建目标的情况，当前文件及已搬离原件均保留。 |
| B05/B09/C03 源码撤销 | 临时关闭 Yjs 撤销栈分隔符恢复，真实 CodeMirror + Y.Text 撤销后在 `B` 后多出 CR。 [红灯日志](/tmp/huhu-fix3/red-undo.log) | 按 Y.Text 字符身份保存被删除的分隔符，随撤销栈恢复。逐次断言删除、撤销、重做、再次撤销后的完整 Buffer，最终恢复 `A\r\nB\nC\r\n`。 |

## 保留与回退

- 保留独占移动与回滚、硬链接不可用时的独占创建回退、相对符号链接的移动检查、资源读取上限及路径检查、旧编码预览及转换、档案列表逐项降级与转换入口，以及混合行尾历史。安装使用平台可选依赖中的 Koffi 预编译模块，`allowBuilds.koffi` 设为 `false`，随后冻结安装通过。
- 保留 ORCA 本地 PDF 恢复的三项定向单测，覆盖过期加载、替换顺序与滚动缩放恢复、反复重载后的资源释放。修正了夹具类型及事件参数。
- 将未完成的镜像、Excalidraw 和内嵌 PDF 的 Vault 读取接线及其配套路由、取消传播回退到 `closeout4/final`。涉及 `NoteEditorSurface.tsx`、`OkRoot.tsx`、`rich.d.ts`、`host-fetch.ts`、EngineClient 与 OK vendor 的六个文件。
- 同样回退宿主端点扫描及生成的 JSON、PDF 查看器键盘归属变更、`tests/e2e` 和 `tests/parity-ok` 中两个现场的未验改动。移除了新增的本地引用块 spec 和 PDF 测试 helper。各测试目录与基线的最终差异为空。
- OK / ORCA vendor 最终内容与 `closeout4/final`（`4f6b7032`）一致，补丁登记失配 0，按任务条件无需刷新 replay 与 catalog。

## 验证

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile --prefer-offline` | 0 | 首次退出 126，因 pnpm 未登记 Koffi 安装脚本策略。使用预编译包并登记策略后通过。 [日志](/tmp/huhu-fix3/install.log) |
| `pnpm exec vitest run --maxWorkers=1 packages/vault/test/operations.test.ts packages/kernel/test/vault-assets.test.ts plugins/notes/test/service.test.ts plugins/notes/test/archives.test.ts plugins/notes/test/viewer-dispatch.test.ts plugins/notes/test/orca-pdf-load-recovery.test.ts packages/editor/test/markdown-file-envelope.test.ts` | 0 | 7 文件，96 项通过。 [日志](/tmp/huhu-fix3/unit.log) |
| `pnpm exec vitest run --maxWorkers=1 packages/vault/test/operations.test.ts -t '最后一次检查后同名写入'` | 0 | 夹具兼容大小写不敏感文件系统的断言调整后，Linux 上两项通过。 [日志](/tmp/huhu-fix3/unit-rename-portable.log) |
| `pnpm exec vitest run --maxWorkers=1 plugins/notes/test/orca-pdf-load-recovery.test.ts` | 0 | 夹具签名修正后三项通过。 [日志](/tmp/huhu-fix3/unit-pdf-final.log) |
| `pnpm typecheck` | 0 | 修正 Y.Text delta 的可选字段类型和 PDF 恢复测试夹具后通过。 [日志](/tmp/huhu-fix3/typecheck-final.log) |
| `pnpm lint` | 0 | lint 与 CSS 检查通过。 [日志](/tmp/huhu-fix3/lint-final.log) |
| `pnpm format:check` | 0 | 740 个匹配文件通过。 [日志](/tmp/huhu-fix3/format-final.log) |
| `pnpm build` | 0 | CLI、桌面主进程、preload、渲染产物及 CSS 检查通过。最后两次复跑仅修正测试文件。 [日志](/tmp/huhu-fix3/build.log) |
| `node scripts/ok-patches.mjs --check` | 0 | 555 条登记，未登记 0，多余 0。 [日志](/tmp/huhu-fix3/patches.log) |

验证范围为 Linux x64 定向单测和静态／构建检查。E2E、性能测试、全量 vendor 测试、Windows/macOS 实机及安装包运行均未覆盖。

## Lead 验收

- 2026-11-20 Lead：接受。三项阻断有判红/转绿单测；notices、knip 另行通过。按用户指示未跑 e2e/性能。
