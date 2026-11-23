# Shell 实际失败只读归因
Lead t3p / t10r / task01，共享根本文件上两级。工作树agent-linux基线4ae7e7e4。当前t109全量E2E仍在integration运行，禁止启动测试/GUI/类型检查/构建/安装，不修改任何业务或测试文件，不派子代理，不操作全量进程。
只读诊断 ../integration/test-results 下 shell.spec.ts 新失败：50MiB日志(218)、ACC-AG-08退出重开(223)、Safe本机分享默认local实际lan(230)、窄窗创建(231 firstWindow timeout)。读取实际error-context和trace、生产实现、规格与已有fixture。区分明确产品缺陷、测试前置漂移与实例隔离问题，尤其检查shell launch是否共用userData/profile导致顺序污染及进程未退出。Core懒启动目前perf测试已由Lead移到打开terminal后再检查，shell同类失败可建议但别改。默认LAN不可为了绿测试改预期，核对产品已确认规则与设备偏好隔离。
报告现有证据、能证实的因果、最小修改建议及后续定向验证，不猜测完成。写temp/final-audit/t10r-report01.md，权限阻塞终端报告不要提权。hc send t3p报告路径。
