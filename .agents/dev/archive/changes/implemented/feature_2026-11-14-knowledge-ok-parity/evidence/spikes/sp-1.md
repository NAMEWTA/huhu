# SP-1 闭包编译（S2a 更新，2026-11-15）——**通过**

分支 `feat/knowledge-ok-parity`（S2a 提交）。932 个文件的 closure 进入 `packages/editor/src/vendor/open-knowledge/`。

| 检查 | 结果 |
| --- | --- |
| `tsc -p tsconfig.vendor.json`（OK 自己的 strict 选项，不含 Huhu 的 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`） | **0 错误** |
| Vite 8 构建（`pnpm --filter @huhu/editor run build:harness`，含 Lingui 宏、`.po` 目录、Tailwind v4、`.ok-root` 作用域插件） | **通过**，约 4.7 s |
| `apps/desktop` 的 `electron-vite build`（渲染进程已接入同一组插件） | **通过** |
| 补丁量：`node scripts/ok-patches.mjs --check` | 改动 5 / 删除 4 个文件（阈值 150）；新增 26 个（server-bridge 11 个复制 + 9 个替身，其余 CSS / 声明 / 目录） |
| Huhu 侧替换行数（`host/` 约 530 行，含 100 行生成的 barrel；server-bridge 替身 96 行；合计约 630） | 阈值 1200 ✔ |

关键发现（S0 的 E0 调查没有写到的）：

1. **OK 把“编辑树 ↔ 源文本”的跨 CRDT 桥放在服务端**（`server-observers.ts` 1665 行 + `map-driven-splice` 等）。客户端的 `observers.ts` 是空壳。所以“摘取 bridge-intake”不够；本地宿主把整座桥（11 个 server 文件）原样搬进渲染进程，用空实现替掉 OTel / 日志 / 影子仓库（P-S2a-srv）。
2. 编辑器行为以 OK **锁文件**为基线：OK 的 package.json 对 tiptap 写 `^3.22.3`，锁文件是 3.22.3；Huhu 浮动安装得到 3.34.0，`@tiptap/react` 的 `reactMobileEnter` 插件与上游的 park / 重挂载不兼容（SP-6 实测报 `Adding different instances of a keyed plugin`）。修复：`scripts/ok-align-deps.mjs` 把新增依赖钉到 OK 锁文件版本，`pnpm-workspace.yaml` overrides 固定 27 个 `@tiptap/*` 传递依赖与 `mdast-util-to-markdown`、`mdast-util-mdx-jsx`。
3. 根 `.gitignore` 的 `lib` 会吞掉 vendor 的 `lib/` 目录（125 个文件没有被提交）；已加例外。
