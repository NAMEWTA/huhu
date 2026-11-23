# 同包验收脚手架独审
Lead t3p / worker t10n / task02，共享根为本文件上两级，工作树agent-linux，基线4ae7e7e4。先读t10p/report01和task01。
仅只读核对新 tests/e2e/helpers/candidate-desktop.ts、workflows/web-share.spec.ts、automation-linux-environment.spec.ts 及 scripts/accept-linux-candidate.sh 的当前差异。确认同一AppImage实际随包Engine/Core/CLI身份，无源码fallback；Web重开Vault持久化、两个独立profile、SecretService及Socket隔离；清理不吞主要错误且不误停其他Core；Safe已初始化并锁定时模块凭据链条；rule模式数量/flag对应实际测试。找真实缺陷，不以存在测试当作通过。禁止任何测试/类型检查/安装/构建/启动GUI，禁止修改业务代码或子代理。报告temp/final-audit/t10n-report02.md，权限阻塞改终端正文，不提权。用hc send t3p回报。
