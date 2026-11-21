# WP5 · 编辑器核心行为

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-w5`，分支 `closeout4/wp5`。先读 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。
归属：`packages/editor/src/rich/RichMarkdownEditor.tsx`、`rich/compact.tsx`、`rich/OkRoot.tsx`、`host/host-fetch.ts`、`host/config-provider.tsx`、vendor `app/src/editor/*`（登记补丁）、`tests/e2e/knowledge/editor-*`、`packages/editor/test/golden-roundtrip.test.ts`。
范围：B05（富文本与源码模式共用单一撤销历史，交错编辑顺序；真实 y-tiptap 栈撤销 slash 执行；外部回写不入栈）、OP-D18（compact 过滤文档级 slash 项，保留 @；不可创建文档批注的负例）、OP-D04（不装全局 fetch 包装，改为 vendor 局部入口；断言无关模块 fetch 身份不变；卸载恢复）、Q3（设置可开启外链预览，主进程限时限量抓取，离线回退；默认关闭）、H01（全部黄金样本实际 hydrate→serialize，字节不同的逐样本登记并断言等价谓词）、B01（矩阵逐行绑定真实结果，斜杠 36 项逐项断言节点类型/属性）、B02（同一混合文档编辑→阅读→保存重开三阶段语义）、B03、B04（Electron CDP 的斜杠/IME 上下文）、B06（反向拖选、边缘自动滚动、表格、横坐标）、B07（真实键盘与系统剪贴板、拖放，不用 JS 派发 ClipboardEvent）、B08（自动保存、后台评论刷新、属性更改、父组件重渲染四事件下实例不变、IME 不中断、焦点不丢）。
