# 保存状态统一不变量疑难分析
Lead t3p，worker t14m，agent-linux。只读疑难分析，无验证无代理无消息，输出 temp/final-audit/t14m-report01.md。
背景：DocumentSession 手动快照/字段队列/跨代写对账多轮红绿，原问题已修，但 t147和t14j各找到相邻自动入口竞态。现65项单测绿，t14j新两项正由t13b补红。请读 t14j-report01.md、t13b-report06.md、t13x-report01.md 和当前真实调用者，提出统一最小状态所有权而非继续每个入口补丁。
核心不变量：已发写入及结果核对尚未结算期间，hasUnsaved/切Vault/自动重载不能把撤销后的缓冲视作无改；自动外部通知不能替换缓冲；明确用户重载/冲突解决要可用；保存快照队列、字段正常合并、普通确定失败可重试、未知结果保守留稿且不重放。分析 pendingBodyWriteGeneration/reconcilingWrite/lateWriteConflict/diskRevision/loadSeq 的职责冗余及最小修复。不要大重构或新框架。
额外核实真实EngineClient响应体失败包装INTERNAL，不能只以原始TypeError测试证明未知分类；结合现有错误契约指出可落地判断边界、是否需要共享client明确结果未知标记，或保守会话处理。不要提出缺真实证据的无穷风险，给可实现边界和最低必要回归（现有65不要重复补）。
可读全部直接调用链，只能写报告，不改生产测试。前端指南沿已有完整 /tmp/mwg-guide-3235787-1795365728802.md，不联网。
