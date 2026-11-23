# task07：复审 task06 后续读失败 P3
Lead t3p。等 Lead 明确冻结后执行。cwd integration，仅只读业务。
依据 temp/final-audit/t194-task06-final.md 与 t197-task03-final.md，复审 DocumentSession.ts、document-session.test.ts 最新冻结差异。核对延期后的同基线外部读取失败、组合取消/提交后的重新取样，以及显式重载、删除、基线变化仍失效。不扩大为通用架构重写。可复跑单个vitest，不能E2E/build/全仓；不启动agent。
报告只写 temp/final-audit/t194-task07-final.md，无需HC发送或共享目录写入；Lead主动读。
