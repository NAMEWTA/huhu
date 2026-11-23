# Mail 工作台中断后原批次恢复
Lead t3p，worker t86；工作目录integration。上轮task05已冻结提交18aa8c6b并由Lead定向复验。当前只修 t9b/report01.md 的工作台P2，读完整报告与对应S6b.1规格。
后端dbe58665原A+B与keepSeparate批次重交正确；工作台MailSubsetSettings禁选restored行，重开后只能B单选，错成新独立账号且失去无定位标记。目标：用户能显式选择并延续同一原批次，保持原B ID/标记；换主体/ZIP/选择不得继承豁免，已有账号认证不变。不要回退批次绑定或自动隐式授权；通过现有预检/恢复交互补足可操作入口。
先读取并执行zh-modern-web-guidance的search/retrieve。允许MailSubsetSettings.tsx、必要小范围Mail共享预检契约/后端元数据与对应单测/E2E；若无需后端不要改。不动Agent/Automations/native/SSH/公共契约及根配置。只单文件Vitest，E2E只写不跑。重开与部分失败要有用例，确认两个原后端问题仍关闭。自行检查现有UI复用，不新建基础设施。
读AGENTS和dev-build，按独审的真实触发路径最小补缺，写report06.md，报告未运行验证。完成冻结，不提交全仓，不启动代理。