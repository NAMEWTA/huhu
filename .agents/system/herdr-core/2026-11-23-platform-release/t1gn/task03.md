# task03 macOS 包内 Core 连接失败分析
Lead t3p，worker t1gn，共享目录 /home/wta/projects/huhu。只读分析，不启动子代理/重型验证，不修改源码。报告写 temp/cross-platform-release/t1gn-report03.md。
Actions 45135526567 Windows已成功4/1，macOS26打包成功但 packaged.spec.ts139 shell启动HERDR_UNAVAILABLE confirmed_not_created。完整日志 temp/cross-platform-release/macos-retry.log。源码固定tag e14bc4c7，现main产品代码相同。检查打包fixture环境（HOME/XDG/HC_SESSION等）、macOS Core启动bundle/launchd路径与旧rc4通过日志，提出最小诊断workflow步骤或有证据的夹具修正。不能跳过断言或假称绿灯。先报告具体可能原因与证据。不要运行hc/gh，Lead处理。
