# #10 W03-01 Widget 注册所有权返工

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t6s
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t6s
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6s/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6s/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/widgets，分支 impl/huhu-issues-3-10-widgets，当前 `15403bd772d65ae486688ffca821b271dde50605`。

读 #10 W03-01、t3b/report01、t4z/report01 和 W02-02 的保存组件接口。按 dev-build 与 dev-verify 修复可信注册对普通结构、以及目录对嵌套 JSON Schema 引用的漂移。输出来自与运行期保存校验相同的真实 SSH Zod 源，注册时确定来源和所有权，拒绝或不可变地接收普通对象的行为需有明确理由和实测。保持静态 SSH 组件、清单、权限按 Vault 快照及调用者判定、已有注册注销行为。先执行 zh-modern-web-guidance search/retrieve 并读指南，对已有 Electron 44.9.1/Chromium 152 及 Edge 157 跑真实投影定向验证和红绿反例。不改待确认的目录 UI 或布局。

可写该分支的 `packages/contracts/src/home.ts` Widget 相关定义、`packages/workbench/src/contributions.ts` Widget 代码、SSH 私有贡献和相关定向测试。集成 `home.ts` 与当前板保存 DTO 有并行占用，Lead 合入时核对。Renderer、Engine 装配、根锁与 Vault 包收集器由 Lead 持有。策略判断采用合成账号/Vault，不操作真实 SSH。

仅 Windows，禁止远端写入、增加 Git worktree 和自行派遣。依赖可从锁定 pnpm 安装，或使用已证明同 lock 的本机隔离副本。浏览器夹具可参考 t3b 与 t4z 报告。记录候选 SHA、精确复现和验证输出，发布前检出应干净，关闭完成且无后续用途的命令 pane。
