# 原生历史派遣审查修复
身份 t1fp/task01.md，Lead t3p，根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release，代码 /home/wta/projects/huhu，sol/high。
读取 temp/closeout-release/t1fg-report01.md 及其探针/日志，核对四项发现后修复。读取 t1dd/report01-03 与 t1d7/report01 沿用已有契约；别重新设计原生桥。
范围：agent-cli 原生历史/dispatch/sessions/index/helper、Tasks executor/dispatch、Automations扫描与真实资格、相关合同及定向测试。Mail、workbench/home、版本/lock不动。不得启动agent。只写业务/测试及运行单个受影响Vitest文件；E2E只写，禁止构建/打包/全量types/lint/浏览器。
四项：取消未发送恢复必须释放原输入占用和writer，工作台可正确结束；准备后停用Codex必须在首轮写入前拒绝，已发对账不受破坏；无关同cwd不同profile/线程不得误判忙，真实writer冲突保留可等待原因；自动化预览与发生冻结必须使用与Tasks一致的受控历史资格及忙原因。先通过真实代码/低成本回归确认失败，再修复，避免弱化取消/意图/来源验证。
最终首轮写入前同步资格必须覆盖配置变化与所有权，不把取消已发送变成重复投递。保持原意图、原thread、rollout、来源revision与问答回执。
写 report01.md，记录改动、红绿证据、未运行验证、需Lead运行的具体文件/用例。共享报告目录只读则写 temp/closeout-release/t1fp-report01.md，不升级权限；Lead主动收取。控制消息可发送Lead t3p，遇锁只读无需重试。
