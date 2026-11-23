# t17c task01 回执即时投递独立审查
Lead t3p，integration HEAD4a54f0a9上未提交diff。使用dev-review，sol/xhigh。只读业务/测试，无子代理。不运行E2E/build/全仓门禁；只允许必要的单文件Vitest，但回环监听沙箱限制时不要请求扩权，交Lead。
当前后端diff已稳定：plugins/tasks/src/engine/dispatch.ts、index.ts、test/persistence-http.test.ts。独立检查持久consume后void check(afterReceipt)，check已有轮中用receiptCheckQueued合并后续检查，防止原5秒投递延迟。重点确认ACK持久顺序、写锁/死锁、并发丢唤醒、幂等与重启/关闭、错误不形成忙循环，原授权保持。Lead t17b正在单文件全40项绿色验证，log temp/final-audit/task-receipt-wakeup-check.log；红灯task-receipt-wakeup-red.log。
UI/acceptance夹具 t176仍编辑，先不要审其半成品；后端审完报告即可。产物仅temp/final-audit/t17c-report01.md，注明实际验证/未验证。不要写工作树外或申请权限复制/发hc；完成状态和报告由Lead主动收取。
