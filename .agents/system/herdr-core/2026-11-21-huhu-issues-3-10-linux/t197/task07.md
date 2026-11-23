# task07 原生历史安装入口兼容返工
Lead t3p；worker t197；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
读取 temp/final-audit/t194-task14-final.md。关闭两项具体发现：Volta具名codex被realpath替换后无法执行；Windows npm/pnpm cmd/bat已被普通探测/启动支持，却被历史动作全禁用。优先复用现有可执行程序解析/批处理参数方式，小范围适配。保留具名入口执行语义且校验其真实文件，不将未经验证任意字符串拼为shell文本。两段app-server/TUI共用同入口、profile、cwd。不要修改SSH或其他业务。
沿用task06授权12文件范围，新增辅助仅在现有history文件内部优先。先单文件测试证明具名shim红灯；批处理方案用可移植平台参数构造测试覆盖，不假称Windows实跑。实际固定0.170离线探针t1c3通过，已无需重建协议；Lead会补受影响实测。
worker只单文件vitest及定向静态，不E2E/build/全仓。报告 temp/final-audit/t197-task07-final.md，记录红绿/冻结/未跑。尽快完成具体返工后冻结供独审，无新基础设施或代理。
