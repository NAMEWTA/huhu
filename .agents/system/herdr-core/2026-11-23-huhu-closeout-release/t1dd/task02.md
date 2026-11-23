# 恢复派遣定向类型错误
身份 t1dd/task02.md；Lead t3p；共享根与工作目录沿用 task01。当前 Lead desktop tsc 发现 plugins/tasks/src/ui/TaskEditor.tsx(353,104): TS2322 string | null | undefined 不能赋给 string | null。日志 temp/closeout-release/mail-reviewed-desktop-types.log。仅修复你改动造成的类型错误、检查相同选择路径，保持真实过期提示语义，不用断言掩盖。不运行重型检查。写 report02.md（只读则 temp/closeout-release/t1dd-report02.md）。随后 Lead 重跑类型和原生产品路径。
