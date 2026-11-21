# 复审修复 B · 编辑器、宿主与 B01/G04 证据
工作树 `/home/wta/projects/huhu-wt-fix2b`，分支 `closeout4/fix2b`（= closeout4/final 4f6b703）。角色：具体实现（gpt-6.2-sol medium）。通用要求 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。测试纪律：全部改完再统一跑一次定向 e2e（单 worker、零重试），只重跑失败项；不跑全量、不测性能；启动 Electron 前确认无其他 Electron/Playwright（另一个修复会话也会跑，有就等）。依据：复审 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/report02.md`（探针与日志 `/tmp/huhu-4f6b703-review.5V5z1p/`，先用探针判红），用户决定 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/user-decisions.md`。每项先判红再修，探针场景固化为仓库测试。
另一会话 fix2a 改 `packages/vault`、`plugins/notes/src/engine`、编码转换视图，本包不改这些文件。

## 阻断
1. 源码模式撤销改写混合换行：`A\r\nB\nC\r\n` 删 B 后 LF、交付后撤销得到 `A\r\nB\r\nC\r\n`。随编辑历史保留删除位置的原分隔符，撤销/重做恢复对应字节；补真实输入→保存→撤销→再保存→重开的完整 Buffer 断言（单测 + Electron）。
## 应修
2. B01 第 118/119 行：镜像与 Excalidraw 块经 `useCollabUrl`/live-doc pool 读取未打开文档时返回「文档未登记」。让保留的块通过当前 Vault 受控本地读取与失效通知加载（含 `/api/config` 宿主调用），应用入口验证已有文件、变更后更新、切 Vault、释放。第 114 行 PDF 块：验证已有 PDF 从内嵌块逐页显示与重开，或给出认可范围出处。
3. B01 矩阵：第 208、353 行回填复审列出的上游断言并补 Huhu 实际入口证据（353 的 agent-insert-flash AI 部分按 Q2 登记）；第 98、169、346、348、354 行改为引用用户决定/spec §8/Q2 的具体出处并删除旧「推定/未核实」字样；修复第 65、128、266、288、297、300 行落空的锚点；更新 §15、§18 为全表计数。
4. G04 ORCA：`pdf-viewer-failed-load-recovery.test.tsx` 不应整文件不适用——对 :268、:324、:402、:459 的过期任务、替换时加载与释放顺序、滚动/缩放恢复、反复重载资源补 Huhu 等价测试（对应 `pdf-document-loader.ts`、`pdf-viewer-session.ts`），外壳/Base64 差异按子项登记；确认 `pdf-viewer-zoom-ownership` 当前分栏拥有缩放键盘命令。重算 ORCA，须 ≥70%（按 partial 不计通过）。`vendor-test-catalog.mjs` 同步。
5. H04：`check-host-endpoints.mjs` 按「方法 + 路径」逐调用记录实际绑定 handler（`/api/comments` GET 经 URL 变量也要识别）；`/api/config` 的排除改为接入（见第 2 项）；端点矩阵记录可执行调用的输入/输出/失败反馈。
6. B03：用 `tests/parity-ok/compare.spec.ts` 的两端 runner 对 Huhu 新增的合法前缀、越过首尾、展开后滚动、右缘、切换清理同序列对拍，含遮挡时归属；更新 `evidence/parity-ok/slash.md`。
7. D02：`evidence/parity-ok/comments.md` 按用户 D02 决定更新正文渲染差异；用预置已解决态的固定 OK 夹具查过滤/重开，或记录不可达的具体依据。
8. H05：已有任务的 `TaskEditor` 修改入口补输入、撤销后再组合、保存与重开联合 Electron 验证。
9. Q6、Q8：`evidence/s0-facts.md` 写明本地冻结引用比对不能证明 S0 时点远端差异的证据限制；Q8 在发布草稿中记录 `vault.tree`/`notes.files` 等旧名外部消费者的核实范围（仓内与公开契约文档）及结论，按 Q8「有外部依赖则保留一版并标弃用」判断，查不到外部依赖时如实写明证据边界。
门禁同通用要求（vendor 改动刷新重放与来源清单）。回报 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/fix2b/report01.md`，manifest 中 fix2b 行改为 task01.md done。
