# Graph 最后增量复核
Lead t3p worker t120，只读独审agent-linux现有plugins/mail diff。读AGENTS/dev-review、../t117/report01.md、../t11f/report01.md。t11y真实隔离oauth-engine文件3/3通过，日志graph-state-check.log。仅审新增状态/通知合并与检查点兼容，不能扩大产品需求或重复旧已闭问题。
特别判断arrivalWatermark按receivedAt比较会不会把同时间戳/倒序投入新信静默，S5.2明确初扫后投入新信需通知；要区分delta历史完整更新与真正新入箱，不能为好通过用启发式代替契约。若确有漏洞给最小场景及可复用修复方向，不要求不存在的exactlyonce外部服务能力。结合原缓存有限窗口规则与Graph真实API属性。也检查当前diff是否引入新状态覆盖/重复通知。
仅写temp/final-audit/t120-report01.md，不修改代码、不运行验证、不派子代理、不提交。不用hc send，只终端回复，我直接读报告。
