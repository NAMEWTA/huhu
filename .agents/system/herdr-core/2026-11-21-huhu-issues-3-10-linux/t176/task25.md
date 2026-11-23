# task25 设置页导入副本身份隔离
Lead t3p；worker t176；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
Graph task24三文件保持冻结供t194独审。读取 temp/final-audit/t194-task11-final.md 的剩余P1。只允许修改 packages/kernel/src/capabilities/package.ts、apps/engine/test/agent-workspace.test.ts。所有导入到新目录的副本均生成新Vault ID（启动页已修）。保留导入验证/外部绑定/原Vault不受影响。
先扩展现有真实Core测试复现 A的Core与shell仍在线，在独立B Engine从desktop vault.importPackage导入A包到C。C首次读v0/无Core，首次保存后A文档版本和shell保持不变；不同VaultID和socket。请先写测试，告知Lead可运行红灯，然后再最小实现。worker不运行真实Core重型；可单文件vitest但重型交Lead。禁止改history index.ts/shell.spec.ts，t197独占。
报告 temp/final-audit/t176-task25-final.md，明确未运行E2E/打包。无新agent无git操作。
