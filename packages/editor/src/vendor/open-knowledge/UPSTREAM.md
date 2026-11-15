# Open Knowledge（OK）vendor 来源

- 上游：`https://github.com/inkeep/open-knowledge`（本地副本 `temp/sources/open-knowledge`）
- 固定提交：`44a2e0a6acce5952da0764746e3693fded5025b4`（冻结，不升级；升级是单独 change，decisions OP-D19 / Q6）
- 许可证：GPL-3.0-or-later（与 Huhu 相同）。上游 `LICENSE` 在本地副本的工作区被删除，本目录 `LICENSE` 取自 `git show HEAD:LICENSE`（SHA-256 `3972dc97…b36986`）。
- 范围：`scripts/ok-closure.mjs` 从编辑器 / 评论 / 文件树 / 属性面板入口做 import 闭包，清单见 `.agents/dev/changes/2026-11-14-knowledge-ok-parity/evidence/closure-manifest.json`（上游路径 → SHA-256）。
- 目录映射：`packages/app/**` → `app/**`，`packages/core/**` → `core/**`，`packages/server/src/{server-observers,map-driven-splice,bridge-watchdog,bridge-quiescence,pre-drain-discriminator,bridge-intake,bridge-loss-detector,cc1-broadcast,doc-extensions,agent-activity,md-manager}.ts` → `server-bridge/`（OK 把“编辑树 ↔ 源文本”的跨 CRDT 桥放在服务端；本地宿主把它搬到渲染进程里原样运行）。
- 重新生成：`node scripts/ok-closure.mjs && node scripts/ok-vendor-sync.mjs`；`node scripts/ok-patches.mjs --check` 校验 PATCHES.md 与实际差异一致。
- 依赖版本：`node scripts/ok-align-deps.mjs` 把新增依赖钉到 OK `pnpm-lock.yaml` 实际解析的版本（编辑器行为以它为基线）。
