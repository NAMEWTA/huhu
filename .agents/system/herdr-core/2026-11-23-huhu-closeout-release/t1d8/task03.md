# 修复网格夹具运行入口
身份 t1d8/task03.md，Lead t3p，共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release，工作目录 /home/wta/projects/huhu。沿用 task02 边界和模型。task02 夹具交付已检查，运行中发现环境/夹具错误，此轮修复后交 Lead 重跑；不改生产代码，不减行为断言。
Lead npm install 初次下载停滞，重试带 fetch-timeout=30000 后 exit0，package-lock已生成。服务 t1dx 在 127.0.0.1:42710 运行。
1. Vite dependency scan 报 TSCONFIG_ERROR: @homarr/tsconfig/base.json not found，因直接导入固定源码其 tsconfig 继承未解析。以小范围适配真实原文件方式解决，不安装上游全栈，也不复制算法改写冒充原件。
2. artifacts-first 在 harness 下，Vite watching trace资源HTML导致 page reload。配置忽略全部 artifacts*/输出目录，或输出移到服务根之外，并保持真实 evidence。
Lead 已停止首轮 t1dy（32项刚启动，不能记通过），日志 temp/closeout-release/grid-runtime-first.log；可读 t1dx输出。你只修夹具/配置/用例可靠性、静态检查，Lead 重启并运行。完整原始失败保留 artifacts-first。写 report03.md，原子发布回告。
