# WP7 · 释放、泄漏与性能证据

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w7`，分支 `closeout4/wp7`。先读 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。
归属：`packages/editor/src/host/provider-pool.ts`、`host/hocuspocus-provider.ts`、`tests/e2e/knowledge/leak.spec.ts`、`tests/e2e/knowledge/huge-vault.spec.ts`、`tests/e2e/perf.spec.ts`、`tests/e2e/knowledge/fidelity-local-edit.spec.ts`、`tests/e2e/knowledge/compact-cost.spec.ts`、新增 perf/leak 夹具。
范围：H06（区分后台停放与关闭最后视图；自建 Y.Doc 的 destroy 职责；关闭超池容量后 Y.Doc/Tiptap/CM/observer 计数归基线，计数不可取得时失败而非跳过；运行时无网络 provider、无 IndexedDB 的否定断言）、F10（逐轮真正打开-关闭、多于池上限的不同笔记；编辑器实例、observer、Object URL 创建与释放计数）、F09（≥10 万文件 Vault、1 MiB 长文、多批注笔记三种场景各自的冷开、热切换、输入、保存、内存 p50/p95，记录机器与样本量；用夹具与驱动产出数据，正式数值由 Lead 在空闲机器上复跑，本包只需在负载 <2 时跑一次小样本确认驱动可用）、H05 成本（任务描述与收件想法可编辑实例的初始化时长与内存，挂载前采基线）、H07（临时 git 基线，首次与后续改动的 diff hunk 断言）。
