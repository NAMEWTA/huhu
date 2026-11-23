# Graph 到达证据与有限窗口方案
Lead t3p worker t125 astra/high，只读疑难分析agent-linux plugins/mail。连续两轮修复后t120仍报告新信/历史通知歧义与旧列表窗口缺一；读../t120/report01.md、../t11f/report01.md、S4.2/S5.2及实际代码。
任务：查官方Graph协议与temp/sources成熟参考，辨别review建议changeType=created是否真的可靠（尤其文档目录层read状态例外），给出可实施的最小完整方案：同时间/倒序新信不漏，历史201补位/普通更新不误报，有界候选/游标/重放/取消仍成立，初扫无通知。不允许用时间阈值或扩大窗口冒充来源证据；也不要求超规格跨无限历史exactlyonce。需明确何种服务证据可区分，若真实API根本不提供足够信息，提出符合原验收的保守产品规则并标出需用户决定的那一点，别继续堆启发式。
另给旧列表含已删项时如何按有效条目继续nextLink填200的调整。用现有持久缓存与通知路径，不新建基础设施。只写temp/final-audit/t125-report01.md，不改代码、不运行测试/types/build/E2E，不派子代理不提交，不用hc send。我读文件。
