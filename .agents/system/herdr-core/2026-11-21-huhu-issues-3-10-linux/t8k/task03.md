# Linux 真实 provider 和交互返回实现
身份 wta-ubuntu/t8k，Lead t3p。工作树 agent-linux，HEAD 5a4de7ae，树与集成8fa80d52相同。Lead已将t86当前native-pty.ts及Go mask/console的4文件改动带入，必须保留（waiting信号与规则输出***且原字面[REDACTED]不变）。
用dev-build，先读t91/report01.md与t8y/report01.md第1/2项、Issue4 source §9/C01/C02，按前者方案实现真实Volta Codex/Pi、直接npm Pi、原生Claude受保护交互，并在Agent自然返回后同host/PTY保留交互shell。不要缩成裸ELF/合成测试支持，不另造通用容器。沿用既有Windows批准安装/声明文件边界、resolver参数、私有broker。返回shell剔除保护值、保留普通环境，自动化approvedShell无返回shell且执行一次直接结束。
可写：plugins/agent-cli/src/engine/interactive-environment.ts、native-pty.ts、相关新解析模块与直接单测；native/agent-pty/**；tests/e2e/agents/linux-environment.spec.ts；相关provider离线夹具。禁止sessions.ts、launch-binding.ts、Automations、index.ts、共享契约、桌面装配、锁文件、SSH、其他E2E。协议/计划类型由你统一改，t86已停止写你的文件；尽量可选字段保持已有调用者与Windows兼容。需sessions适配请列具体变更交Lead。修改客户端前先modern-web-guidance，纯引擎/Go/测试不触发。
具体技术：已识别Volta限定解析及正确Node配对；Pi固定清单/入口/bundle并保留资源/相对模块；Codex包布局/资源/自重执行语义不能被memfd破坏；具名映像核验与执行须一致，复用原有fd/身份，按t91所列读租约或版本副本作小适配。交互两阶段监督与同PTY、cwd/termios/前台组/resize/取消/后代清理。不要允许旧预览在安装改变后交付。
Worker只写代码/测试，运行对应单个Vitest文件；禁止Go构建/Go测试、E2E实跑、全仓门禁/打包。编写Go测试和真实provider离线验证脚本供Lead串行执行。真实安装可读元数据，不访问真实历史/凭据。测试必须覆盖解释器/入口/chunk更换、原argv边界、退出17后shell可输入并exit23、保护值不进返回shell、规则一次结束；真实provider跟合成测试分列。
报告report03.md列完整文件、接口、采用来源提交/许可证（给Lead更新ledger）、实际单测及未运行验证、复验命令。不要提交。首轮先完成可审查实现，不等Lead重型验收。
