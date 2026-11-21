# W5 Native 文件精确绑定分析

共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t1bq
task task01.md
report t1bq/report01.md

gpt-6.2-astra high。只读冻结对象 7ff591a0，避免运行任何会改写集成工作树或用户真实 provider 数据的命令。读 t1bh/report05.md 的两项 W5 P2，实际 provider 入口代码 history/scanner.ts、engine/index.ts、launch.ts 和 sessions.ts。给最小可靠修复方案及证据点，先报可实施路径。不要动业务文件或 Git refs。

Pi 已在本机 1.5.2 对隔离 JSONL 完成分支、续开与跨 Space 定位。选中同路径同 native ID 替换时，需要文件系统身份与原始 cwd 绑定。目标 append 不能变身份，外部替换必须拒绝。给快照、launch/read、pin 老行为一并考虑。

Claude/Codex 只接受 UUID 但历史 drawer 未按实际 CLI 存储环境解析，Codex 0.171.0 官方 rollout list.rs 在 sessions 文件搜索前走 state DB，可能指向存储之外的同 ID 文件。请核对 pinned Rust 源码、本地 --help、App-server thread/read 或其他能确认使用准确原子绑定的官方接口、Claude 官方与本地有无真实 CLI，别读取 ~/.codex / ~/.claude / ~/.pi 真实用户历史。输出可保留已有可靠用户路径、明确各 provider 缺失/不可验证时只预览的条件。若外部替换在最后进程间跨越无法保证，据实写边界。可用独立临时合成 CLI fixture，禁止外部模型或登录。
