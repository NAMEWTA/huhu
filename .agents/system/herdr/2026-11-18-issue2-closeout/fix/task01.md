# 修复独立审查发现（阻断 + 应修）

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-fix`，分支 `closeout4/fix`（= closeout4/final 2fbe53f）。通用要求 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。测试纪律：全部改完再统一跑一次定向 e2e（单 worker、零重试），只重跑失败项；不跑全量、不测性能；启动 Electron 前确认无其他 Electron/Playwright（b01 会话也会跑 e2e，有就等）。

依据：独立审查 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/review/report01.md`（复现探针在 `/tmp/huhu-e550c52-review.vh8KEK/`：`cm.cjs`、`probes.mts`，先用它们判红）。用户决定 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/user-decisions.md`。每项先判红再修，修后把探针场景固化为仓库内测试。

## 阻断
1. B09/C03/F02 源码模式 CRLF/BOM 坐标错位：CodeMirror 与 Y.Text 必须在同一坐标表示上工作（如在 Huhu 信封层统一为 LF 并记录原分隔符，写回时恢复未改行的原分隔符；混合行尾无法无损映射时提示显式转换）。Electron 验收：CRLF 与 BOM+混合行尾文件在源码模式改第一个 CRLF 之后的字符，磁盘字节正确，切富文本/重开一致。
2. F02 非 UTF-8 Markdown 被替换字符覆盖：进入编辑与所有会改写文本的服务入口做无损解码检查；不能无损解码时只读并提示，提供显式转换（与 TXT/JSON 一致，F02 原规格要求「提示并要求显式转换」，TXT/JSON 也补显式转换入口）。原字节在转换前保留。
3. A07/A08/E04 目录移动遗漏真实条目：按真实目录内容（含未索引新文件、空子目录、受保护规则）规划，可恢复的整目录移动或在 OperationLog 中显式处理全部子项，前缀映射来自实际结果。测试：watcher 尚未交付时的混合子树。
4. A07 复制覆盖并发创建：OperationLog 支持「目标必须是新文件」前置条件，提交时无覆盖原子创建；同进程名称预留。测试：选名后外部同名出现，两份字节都保留、复制报冲突或另取名。
5. D04 长重复上下文删原段后仍吸附：以旧版本对应区间与编辑映射为优先证据，可能是幸存同文时孤立并要求重选。测试：审查探针场景的磁盘线程、边缘按钮、高亮。
6. G04 ORCA / OP-D09（用户决定：保留 Huhu 外壳，按 ORCA 上游关键断言补等价断言）：`PdfView.tsx:237–253` count listener 防晚旧回执；补 ORCA `PdfFind.test.tsx:54–80` 的同步缓存响应订阅顺序与清空后晚旧回执断言、活动高亮所在文本与关闭后移除高亮的断言。重算 ORCA 通过率（不得把部分覆盖计为整文件通过），须 ≥70%。更新 `plugins/notes/src/vendor/orca/pdf/UPSTREAM.md` 登记为用户批准的等价适配。
## 应修
7. A08 文件操作在途的新输入：flush 到 remap 区间的会话迁移或在操作期间暂停相关编辑；可控回执测试新输入在新路径恢复。
8. A08 大小写改名：两次物理 rename 纳入 OperationLog 并可回滚；失败测试。
9. H04 批注读取请求代次：加载/错误状态与列表快照用同一按上下文的请求代次，合并 in-flight；测失败/成功乱序、切标签、非空恢复。
10. H04/OP-D04 host-fetch 路由栈：按调用宿主范围绑定路由（多 Root 同端点不串），校验方法；补并挂/逆序卸载/异步切换测试。`check-host-endpoints.mjs` 补方法维度。
11. F03 `viewers.spec.ts:328–341` 原生 watcher 不可用时跳过的 PDF 外改：改为可确定触发的外改断言，不再条件跳过。
12. Q8：发布说明写入 `notes.move` 目标目录须已存在、`notes.create.templatePath` 仅桌面（找现有 release notes 草稿位置，如 `evidence/s8/release-notes-draft.md`）。
13. 建议项：`git diff --check` 尾随空格（补丁上下文行除外）。
门禁同通用要求。回报 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/fix/report01.md`，manifest 中 fix 行改为 task01.md done。
