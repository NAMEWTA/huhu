# 快照与 HTML 修复独立审查
Lead t3p worker t12q agent-linux。读 AGENTS/dev-review。只读代码，不跑任何验证，不派子代理不提交不调用 hc send。
审查 apps/desktop/src/renderer/index.html img-src blob 放行，notes/shared/text-encoding.ts 与 ui/viewers/dispatch.ts HTML8MiB共享及service回归；以及 editor vendor snapshot-url-pool.ts 新增移除DOM时回收URL、ExcalidrawEmbed.dom.test.tsx卸载回归和Activity保留检查、snapshot-url-pool.dom.test.ts新移动/共享图像回归。最新测试正在Lead跑，不修改。
证据：t128真实HTML源码提示只能探测受支持文本；t129三fail、t12b44pass、t12d5pass。t11t CSP拒绝blob图片，隔离旧包只改CSP t11x显示；t12k实际关闭后旧URL仍decode=true；t12m单测24pass1fail；t12n29pass。
重点：Activity hide/show与最终销毁、并发/未挂载快照、多个图像消费、observer生命周期与资源上限、是否破坏既有体验/渲染安全策略。前端现代指南已Lead搜/读js/security，React官方Activity说明隐藏清理Effects但保留DOM：https://react.dev/reference/react/Activity 。不要为凑发现泛化需求。
报告 temp/final-audit/t12q-report01.md，按优先级真实缺陷与证据，未运行项单列。PATCHES和重放文件Lead会随最终实现刷新。
