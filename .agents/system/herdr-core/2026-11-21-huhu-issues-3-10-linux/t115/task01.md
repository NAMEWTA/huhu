# 同包新增旅程独审
Lead t3p / worker t115，agent-linux基线4ae7e7e4。只读独审，读AGENTS/dev-review、../t110/report01.md、../t111/report01.md、../t10s/report02.md。审查 tests/e2e/workflows/git-credentials-package.spec.ts、web-terminal-widgets.spec.ts、helpers/git-auth-fixture.ts，以及它们依赖candidate-desktop/package真实契约。两轴审查，优先实际测试是否能运行、证明声明的闭环、反向断言有真实观察、用户进程/数据不受影响、异常清理不掩盖首错。同包Git系统程序为设计，不要求新打包Git。Web两卡片明确是capability目录拦截的浏览器退化证据，不冒充真实服务授权测试。单SHA门槛保留，未来干净提交新包运行，不能要求兼容旧包混签。
重点：本轮全量遗留pi --help实际是用户Volta shim在空HOME递归，Lead已清理全部属于该隔离目录进程，wrapper PATH现固定node目录:/usr/local/bin:/usr/bin:/bin；查新fixture不会又引入真实provider PATH或不受控服务。
禁止运行所有验证/GUI/测试/类型/安装，禁止业务修改，不开子代理，不提交暂存。只写temp/final-audit/t115-report01.md，列真实阻碍/具体代码依据及未运行项，完成终端回复不hc send。Lead执行真实运行。
