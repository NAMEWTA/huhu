# task11 Launcher 与冷导出返工独审
Lead t3p；worker t194；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
复核 task10 两发现，仅看Lead新增改动：apps/desktop/src/main/vault-session.ts regenerateId；plugins/agent-cli/src/engine/workspace-package.ts stopExportCore及unknown优先于取消；apps/engine/test/agent-workspace.test.ts对应回归；tests/e2e/helpers/candidate-desktop.ts启动页导入选项；tests/e2e/workflows/task-journey.spec.ts的W8.1从启动页导入并保留源应用。
Lead t1bv已业务红灯复现两项，layout-boundary-red.log；首次绿灯阶段因terminal.get参数id应terminal失败（夹具错误保留），修正后t1bx真实Core全文件6/6通过，layout-boundary-recheck.log。真实同宿主socket目录，源Engine停而Core仍在线，Launcher创建目标、初读v0/零Core、首次保存后源doc版本1与真实shell仍live。取消和未取消两条unknown均保留错误与专有cleanup路径。临时测试使用mock未启动进程，按记录目录清理。
Lead t1by定向类型进行中，检查layout-boundary-types.log。五文件格式与lint通过；安装包入口新增测试只写未跑。请只读检查，不跑重型、不改业务、不启动agent。报告 temp/final-audit/t194-task11-final.md。history index.ts归t197，不审其未完成代码。
