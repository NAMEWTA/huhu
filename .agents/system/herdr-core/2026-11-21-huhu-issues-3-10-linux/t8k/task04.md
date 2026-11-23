# 修正真实PTY验证失败
Lead t3p，worker t8k，工作目录agent-linux，基准8aad86e4；集成对应6874c619。先前report03已收取，Go测试与构建t9c通过。
Lead真实运行t9d失败：verify-linux.py:207 assert termios.tcgetattr(master)[3] & ICANON。日志temp/issue-evidence/huhu-2026-11-22/provider-pty-check.log。请诊断这是外层host自身raw与内层PTY的测量混淆，还是实际未恢复。修复应验证真实返回shell看到的终端规范模式，不能删除该验收点。可写仅native/agent-pty/tests/verify-linux.py，若证明Go代码有缺陷先报告，不扩范围。只允许代码/静态检查，不跑Go/PTy，Lead重跑。
另report03中x/sys提交写成4cf...而实际Go缓存v0.50.0.info为00227f1d192842e243cba7763c1f9a1fcb1c4344，既有ledger正确；请在新报告更正来源。写report04.md并冻结。不修改旧report03执行部分，不改其他文件，不启动代理。

Lead补充：t9f四种provider实际version后均在返回shell证明超时，允许verify-real-provider.py与console_linux.go同根因诊断修复。失败须保留脱敏终端尾部。Go/实程仍由Lead跑。
