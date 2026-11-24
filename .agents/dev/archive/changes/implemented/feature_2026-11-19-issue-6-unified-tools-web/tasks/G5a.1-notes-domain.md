# G5a.1 从外部维护笔记和受管文件

[验收报告](../evidences/G5a.1-notes-domain.md)

上级交付 **G5a 通用业务**。本片承接[规格 · 各业务归属与端到端样例](../spec.md#各业务归属与端到端样例)与[原 Issue A07、D08、D09](../source.md)。[本组架构及对象归属](../design.md)

**可见结果与边界**　Notes 负责目录、附件、草稿、收藏、日报、搜索、评论、回收站和恢复；受管文件编辑转到实体所属领域。

**前置产物**　[G3.1 CLI 与外部 API 发现并调用同一能力](G3.1-cli-api.md)；[G2.3 检查为何可用并在实际调用时复核](G2.3-effective-access.md)

**已有代码入口**　[plugins/notes/src/engine/index.ts](../../../../../../../plugins/notes/src/engine/index.ts)、[packages/kernel/src/dispatcher.ts](../../../../../../../packages/kernel/src/dispatcher.ts)。

## 验收

使用独立测试 Vault。记录所用入口、身份、操作前后版本或状态以及失败实得。

1. 按动作清单分别创建、编辑、评论、回收、恢复测试笔记；从列表重读一致，外部修改产生业务事件和新版本。
2. 对受管任务原文提交陈旧版本或关闭目标能力，领域拒绝；读回原内容和索引一致。

## 原型对照与确认范围

打开[本地原型](../prototype/index.html)，从[侧栏导航](../prototype/prototype.js)的「浏览器工作台」对照「浏览器工作台／笔记详情与刷新」。笔记是可见样例，受管文件路由按领域验收。本片验证领域或接口结果，该场景用于对照结果在工作台的解释。可见效果的确认以[原型确认记录](../prototype-review.md)为准；后端合同可独立验证。
