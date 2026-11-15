# SP-1 闭包编译（部分结论，2026-11-15）

分支 `scratch/ok-spike`（worktree `../huhu-spike`）：把 closure-manifest 的 931 个文件原样复制到 `packages/editor/src/vendor/open-knowledge/{app,core}/`，`packages/editor/package.json` 补入 OK 版本的依赖（`pnpm install` 成功，+1286 包），独立 `tsconfig.vendor.json`（OK 自己的 strict 选项，**不用** Huhu 的 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`，用 Huhu 基线会产生约 1700 行错误）。

| 阶段 | 错误数 |
| --- | --- |
| Huhu 严格基线 | ≈ 700+（TS18048 / 2322 / 2345 / 2375 / 2379…，来自更严格的编译选项） |
| OK 选项，缺类型 | 89 |
| 补 `vite/client` 类型与 `env.d.ts`、`@types/hast`、`@types/unist` | **36** |

剩余 36 条（`evidence/spikes/sp-1-tsc-remaining.txt`）的类别：
- 15 条 `@/locales/*/messages.json`：Lingui 编译产物，SP-3 解决，非补丁。
- 2 条 `@inkeep/open-knowledge-server`（`provider-pool.ts`、`lib/auth-token.ts`）：服务端类型，属于要被 `LocalDocProvider` 替换的部分。
- 3 条缺 `@types/diff-match-patch`、`@types/picomatch`：补类型包。
- 约 14 条 `MdxJsx*Data` 的 `sourceRaw / htmlBoundary / sourceBody`：模块增强声明（`.d.ts`）没被 import 闭包带上，补拷这些 `.d.ts` 即可。
- 其余 `lucide-react/dist/esm/icons/*`、`pdfjs-dist ?url`：环境声明。

**结论（仅限类型检查）**：931 文件闭包在 OK 编译选项下 typecheck 只剩 36 条已分类、无结构性问题的错误，需要的“补丁”是补类型 / 声明文件 / 替换 server 依赖，远低于 150 文件阈值。**未做**：Vite 8 的实际 `build`（需要 Tailwind 与 Lingui 先就位，属 SP-2/SP-3）与运行；所以 SP-1 记为“typecheck 通过的前置结论，构建部分待 SP-2/3”，**不是完整通过**。
