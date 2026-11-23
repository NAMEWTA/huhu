# 手动保存与夹具增量独审
Lead t3p worker t124 readonly agent-linux。读AGENTS/dev-review，../t11n/report02.md、../t11g/report01.md。重点审DocumentSession untilClean语义与全部调用方，Lead补NoteDocument显式save/flush分离、comments/ArchivesViews untilClean。t11s红灯35+1fail，t122修复37/37pass。核对退出草稿、模式切换、路径变更、批注与菜单不会吞脏文本或虚报保存。
顺带复核t11g四个候选夹具改动；Lead已修空绑定lint。Web-terminal spec新增已授权真实浏览器同session直接WebSocket观察者负向帧：等待observe与真实二进制回放后发输入/resize并关闭握手，再控制者stty核对尺寸不变/marker未执行。检查是否假阳性、挂起/清理问题。既有其他pending同包范围不要扩张。
只写temp/final-audit/t124-report01.md，不运行测试/types/build/E2E，不改代码不派子代理不提交，不调用hc send。
