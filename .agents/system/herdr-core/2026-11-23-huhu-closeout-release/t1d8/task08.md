# RGL 跨格落点预览修复
身份 t1d8/task08.md，Lead t3p，工作区与task07相同，写边界与worker限制不变。task07最终2E2E已过，保留全部原件。
独审report02（temp/closeout-release/t1fr-report02.md）确认P3：220格距，右移132停住，占位还在旧格，松开提交新格。违反已定ACC-DASH-02落点预览/W04-02。请用成熟RGL公开适配方式最小修复，不修改node_modules，不把自有拖动基础设施重新加回来，不变更实例/保存语义。若上游公开回调提供可修改placeholder，核对实际调用时序后使用。补真实E2E：只跨格一次并停住，核对占位与松手最终落点一致；不多送鼠标事件掩盖。
仅单文件单测或低成本Node，E2E Lead跑。报告report08.md，列改动与未运行验证。完成后冻结源码通知。
