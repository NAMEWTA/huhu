# task02 · WP5+WP6 剩余项（Lead 裁定：凡有符合规格原文的方案，直接按规格实现，不需用户批准）

同一工作树 `/home/wta/projects/huhu-wt-w5`、分支 `closeout4/wp5`。测试纪律同 task01：全部改完再统一跑一次定向 e2e，只重跑失败项，不跑全量、不测性能。

1. H01 BOM：按方案一实现——在 Huhu 文件输入/输出边界独立保留 BOM（与行尾），向 OK 桥传无 BOM 的源；该样本须逐字节一致或落入生产等价谓词，并补「BOM＋CRLF 文件编辑后落盘」的 Electron 验收（可复用 WP2 已有的 `editor-s3-properties.spec.ts:128` 夹具思路）。
2. OP-D08 外链：新增宿主确认的 HTTP(S) 外部打开入口（复用 Huhu 现有外链/`shell.openExternal` 策略，若桌面没有则按 `window.huhuHost` 接口补最小 provider），预览内用户点击 http(s) 链接转交该入口，脚本导航与新窗口仍拒绝。同时补上 H04 缺口中的 `shell.openExternal` provider。(b) 候选对跑不做，列给 Lead（交用户决定）。
3. OP-D09：按指定复制范围引入 ORCA `use-pdf-viewer-find-shortcut` 的最小键盘路由（`editor.find` 绑定、当前分栏拥有命令），保留 Huhu 现有外壳的按钮入口；若外壳必须整体替换才能满足，说明理由后再做。验收查找快捷键、焦点与重载。登记补丁与重放。
4. H04：`/api/asset` 页面图标等消费者接上处理器或给出逐条 N/A 理由并让 `check-host-endpoints.mjs --assert` 退出 0；补齐每个 handler 的正常/错误码/UI 反馈表驱动测试。
5. G04：对 OK 1,065、ORCA 4 个未审上游测试文件逐项分类（适配/替代断言/排除+理由），给出适用分母和是否 ≥70% 的计算；不足 70% 时把可原样运行的用例接入 `test:vendor` 直至达到，或如实报告差距。
6. B01 旧矩阵逐能力链接到具体断言；B03 菜单右缘；B04 撤销后、粘贴后继续 IME；B07 键盘进入代码块、列表退格合并。
7. F05 三个 scheme 标志：不改，Lead 交用户决定。

回报 report02.md，manifest 中 w5:p5 改为 task02.md done。
