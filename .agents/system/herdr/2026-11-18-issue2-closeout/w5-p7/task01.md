# G04 适用分母与 70% 闸门、H04 UI 反馈、B01 剩余链接

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w5`，分支 `closeout4/wp5`（HEAD eb7c594，依赖已装）。通用要求 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`；测试纪律：全部改完再统一跑一次定向 e2e，只重跑失败项，不跑全量、不测性能。接续 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p5/report02.md`（前一会话）。

## 1. G04
闸门（plan.md:62、tasks/00-freeze-and-spikes.md:4、decisions OP-D19）：「上游测试适配后通过率 ≥ 70%」；低于 70% 须与用户商定缩减范围并登记，不能自行放宽。
现状：`evidence/vendor-test-files.jsonl.gz` 中 OK needs-adaptation 954 个。Lead 粗查：其中约 757 个所测生产模块不在 Huhu 的 vendor 副本里（536 个在 packages/server/src，218 个 packages/app/src），约 197 个所测模块已随 Huhu 交付。
要求：
- 按「被测生产模块是否在 Huhu 交付闭包中」逐文件重新核对（以 G01 来源清单 `source-file-catalog` 为准，不按导入了哪些复用模块）。被测模块未交付的，状态改为 not-applicable，理由写明「被测模块未进入闭包」及该模块在 G01 中的处置；被测模块已交付的计入适用分母。不要改动 Q2 已登记的排除理由。
- 对适用分母中未运行的测试做适配接入 `test:vendor`（或给出逐项替代断言链接），直到 **适用文件通过率 ≥ 70%**，并尽量多接入；不能原样跑的写清原因。
- 输出：分母规则、计数、通过率、以及「若按原保守分母」的对照数字，两者都写进 `evidence/vendor-test-results.md`，供 Lead 交用户确认分母规则。
## 2. H04 handler 到用户可见反馈
对每个 hostFetch/okDesktop handler（文件写入、上传、评论、标签、标题、前向链接、模板、预览等）补表驱动测试：正常、错误码、以及用户看到的反馈（toast/内联错误/禁用态），渲染级或 Electron 均可，优先复用现有 e2e 夹具。覆盖表写入 endpoint 矩阵证据。
## 3. B01
旧矩阵 `evidence/parity-matrix.md` 中每个已勾行链接到具体动作断言（文件:行）；没有断言的补断言或改回未勾并写明。列表项拖拽、编辑辅助等仅链接构造样本的行必须补。

门禁同通用要求。回报 report01.md，manifest 中 w5:p7 改为 task01.md done。
