# 同包验收证据与清理修复
Lead t3p / worker t10s / task01，共享根本文件上两级，agent-linux基线4ae。读AGENTS/dev-build，t10p报告、t10n/report02.md。
唯一可写 tests/e2e/helpers/candidate-desktop.ts、candidate-package.ts、workflows/web-share.spec.ts、automation-linux-environment.spec.ts。其他文件Lead或别的worker负责；不得修改scripts/accept-linux-candidate.sh、生产代码，不能提交暂存、子代理、运行任何测试/tsc/build/install/GUI。目前唯一全量E2E在冻结integration进行。
修t10n P2/P3：
- 保留主体首个错误；清理每阶段独立尝试并收集错误，主体失败时附诊断不覆盖，主体成功但清理失败仍失败。复用现有测试helper模式，不做通用框架。令牌撤销失败也继续凭据清除和close。
- helper用本profile/Vault原有描述文件和端点记录所属Engine/Core PID，核对退出、Core停止回执与残留holder，不能仅退出码0即成功。只处理可证明属本fixture的实例，不按进程名杀。沿用packages/herdr-client及packaged.spec现有观测，无法确认残留则保留证据且验收失败。
- 采集实际Engine PID/端点/执行路径，CLI调用前后仍绑定原桌面Engine，MCP端点一致；Core真实可执行路径及包身份相符。加入protected-launch/helper.cjs哈希。禁止输出令牌/凭据正文，附件只用可公开PID/路径/哈希与合成fixture标识。
- 规则第二轮必须能证明领取轮换值（可输出合成凭据hash或不同非秘密标记，不把秘密写持久普通文件），保持脱敏/计次断言，检查CLI stderr，MCP撤销明确授权拒绝。
报告P1不是要改：Lead明确未来干净组合提交重打同一包，单SHA和clean门槛保留，不给旧4ae混签新代码。
不运行验证，只写对应必要测试检查。报告temp/final-audit/t10s-report01.md，权限阻塞直接终端正文，不提权。完成hc send t3p路径。
