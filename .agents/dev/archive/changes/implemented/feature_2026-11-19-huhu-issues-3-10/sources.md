# 本地复用源码

本轮从各仓库默认分支浅克隆到 `temp/sources/`。逐一核对本地 HEAD、远端跟踪分支及已跟踪文件的工作树状态。Huhu 使用当前仓库 `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`，与查询到的 `origin/main` 一致。

| 用途 | 本地目录 | 默认分支 | 本轮检出 |
| --- | --- | --- | --- |
| #3 | `temp/sources/open-knowledge`（本机原件 `temp/sources/open-knowledge`） | `main` | [`b2af296a7304`](https://github.com/inkeep/open-knowledge/commit/b2af296a73049ddd47f6d679b36774ecbdd3d19b) |
| #4 | `temp/sources/herdr-app`（本机原件 `temp/sources/herdr-app`） | `master` | [`317e673f1f15`](https://github.com/herdrdev/herdr-app/commit/317e673f1f1568b876cbaa0b41dabeb9153ecbea) |
| #4、#5 | `temp/sources/herdr-core`（本机原件 `temp/sources/herdr-core`） | `master` | [`c7517808d64f`](https://github.com/herdrdev/herdr-core/commit/c7517808d64f06609e4ecf0db1757005373cc3a3) |
| #4 | `temp/sources/orca`（本机原件 `temp/sources/orca`） | `main` | [`8bc232f5ed8b`](https://github.com/stablyai/orca/commit/8bc232f5ed8b4b36fec0c5f0f85ab96b4c0ccdf3) |
| #5 | `temp/sources/agent-autoloop`（本机原件 `temp/sources/agent-autoloop`） | `main` | [`d1ec2d8e48de`](https://github.com/KKKKhazix/agent-autoloop/commit/d1ec2d8e48de62b2a49bd8dc5985c03482c753ce) |
| #7、#9 | `temp/sources/motty`（本机原件 `temp/sources/motty`） | `main` | [`2daa9db582e1`](https://github.com/t8y2/motty/commit/2daa9db582e16edf60a60b7ada26f47f808f973c) |
| #8 | `temp/sources/one-mail`（本机原件 `temp/sources/one-mail`） | `main` | [`d1be24d5bb83`](https://github.com/zhihui-hu/one-mail/commit/d1be24d5bb83c2da7123b167f119d5abd169b0af) |
| #10 | `temp/sources/homarr`（本机原件 `temp/sources/homarr`） | `dev` | [`b440fdd574c9`](https://github.com/homarr-labs/homarr/commit/b440fdd574c9daa229f5cf64f7b2532770799664) |
| #10 | `temp/sources/react-grid-layout`（本机原件 `temp/sources/react-grid-layout`） | `master` | [`ec4ab79c9744`](https://github.com/react-grid-layout/react-grid-layout/commit/ec4ab79c97448947b04601c2237b2861d94a0fcb) |
| #10 | `temp/sources/gridstack`（本机原件 `temp/sources/gridstack`） | `master` | [`a7f828af1c53`](https://github.com/gridstack/gridstack.js/commit/a7f828af1c5366c02aff8a8c8fafda2abbff58a6) |
| #10 | `temp/sources/dnd-kit`（本机原件 `temp/sources/dnd-kit`） | `main` | [`ccaf3d583903`](https://github.com/clauderic/dnd-kit/commit/ccaf3d583903a5d0b68616310a24aec891ee0d69) |
| #7 | `temp/sources/viva`（本机原件 `temp/sources/viva`） | `main` | [`a5da67aa6344`](https://github.com/vivaui/viva/commit/a5da67aa63440ee836c37a5aa1c70e3eb317401c) |

Motty 的 `go.mod` 将 Viva 指向同级 `../viva`，因此两个目录并列。ORCA 最新 `main` 已可读，Issue #4 的旧固定引用保留为历史。#6 的 Electron、浏览器和 MCP 文档作为协议与版本依据。依赖安装、构建、许可证核对与实际代码移植按具体切片处理。 [项目上游台账](../../../../../../docs/upstream/ledger.md)
