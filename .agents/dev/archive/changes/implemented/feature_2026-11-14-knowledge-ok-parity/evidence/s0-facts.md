# S0 事实记录（2026-11-15，来源：只读子代理 + 主会话落盘）

## 1 来源冻结
- OK `44a2e0a`、ORCA `7041ea02`：本地 HEAD 即固定 SHA，无更新的本地提交；远端是否更新**未核实**（未联网）。
- 两处 `git status` 均为 ` D LICENSE`；`git show HEAD:LICENSE | sha256sum`：OK `3972dc97…b36986`，ORCA `ff1b611f…9112f3`。

## 2 pnpm 与补丁
- Huhu pnpm 12.10.1（package.json:45）；`pnpm-workspace.yaml` 无 `patchedDependencies`，无 `patches/`。OK pnpm 12.8.1，`patches/` 16 个、workspace 登记 16 条（含 `y-prosemirror@1.3.7`）。Huhu 无 tiptap / yjs / y-prosemirror。补丁登记走 `pnpm patch` / `patch-commit`，**需 S0 实测**。

## 3 许可证
- 白名单 `scripts/gen-notices.mjs:8-26`，MANUAL 含 `khroma@2.1.0`。closure deps 133 个：本地可查 46 个全在白名单；87 个未安装、**许可证未核实**。OK 自身有一条白名单外：`node-liblzma@2.2.0`（LGPL-3.0，`just-bash` 可选传递依赖，不打包）。closure-manifest 的 deps 含 4 个脏项（`${__ok_env…}`、`hast/mdast/unist@null`）待清理。

## 4 版本对照（OK → Huhu）
codemirror/view ^6.43.3→^6.43.15；katex ^0.16.45→0.16.22；mermaid ^11.14.0→11.12.2；yaml ^2.8.3→^2.9.1；lucide-react ^1.7.0→^1.70.0；react ^19.2.5→^19.3.1；vite ^8.0.0→^8.3.7；plugin-react ^6.0.1→^6.3.0；tailwindcss ^4.2.2→无；codemirror lang-css/html/javascript/json/markdown/python/rust/yaml、legacy-modes、lint：Huhu 无。

## 5 Huhu 入口位置
- UI 偏好：`packages/workbench/src/state/ui-store.ts`（`createUiStore`，main.tsx:180 创建；**是否按 Vault 区分未核实**）。
- 贡献设施：`packages/workbench/src/contributions.ts`（`ModuleContribution` :17、`ContributionRegistry` :79）。
- 协议：`apps/desktop/src/main/index.ts:31`（`registerSchemesAsPrivileged`，scheme `huhu-app`）、`:121`（`protocol.handle`）。
- `CommentDto`：`plugins/notes/src/engine/comments/service.ts:10`。

## Q6 补充取证（2026-11-20）

| 来源 | 固定 Git 对象 | 本地 origin/main 与固定点的提交差 | 相关目录在这两个本地对象的差异 |
| --- | --- | --- | --- |
| Open Knowledge | `44a2e0a6acce5952da0764746e3693fded5025b4` | 0 / 0 | `packages/app/src`、`packages/core/src`、`packages/server/src` 无差异 |
| ORCA | `7041ea022826ec19d627cd3a129b665822e7bf0a` | 0 / 0 | `src/renderer/src/components/editor`、`src/main/browser/document-preview`、`config/build-plugins` 无差异 |

两个本地快照的 origin/HEAD 与 origin/main 都指向同一冻结 SHA。归档 S0 当日没有查询远端，也没有保存 2026-11-15 当日远端 ref 或文件树。上述 0 / 0 仅是可核对的本地引用差，S0 当时的远端提交数和相关目录差异无法从现存快照恢复。
