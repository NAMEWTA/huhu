# Mail 最终独立复审
身份 t1f3/task01.md；Lead t3p；共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release；工作目录 /home/wta/projects/huhu。模型 sol/xhigh。只读业务文件，不启动其他 agent，不跑 E2E/build/全量检查。
核对 t1dm/report01.md 三项缺陷及 t1dv/report01.md 实现与当前实际 diff。范围 packages/contracts/src/settings.ts、plugins/mail、tests/e2e/workflows/mail.spec.ts，不审其他并行工作。重点共享副本排序等价、坏缓存只隔离投影、持久分栏的并发写/失败/重开/Vault隔离及窄屏只显示裁剪。可运行轻量只读探针，不启动浏览器。Lead 将跑单文件真实网络和 UI/类型。
报告完整身份、确认缺陷/排除结果、证据、未验证项，原子发布同目录 report01.md。若 .agents 只读，写 temp/closeout-release/t1f3-report01.md 并回告，不请求绕过。不要修改实现。
