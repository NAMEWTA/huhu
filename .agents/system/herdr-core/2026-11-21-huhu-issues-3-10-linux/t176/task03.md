# t176 task03 独审返工：持久ACK后延后唤醒
Lead t3p，cwd integration。接续task02报告与temp/final-audit/t17c-report01.md。权限仍限定Tasks engine dispatch.ts/index.ts及persistence-http.test.ts；UI/夹具已通过旧4a应用3项，保持冻结。
按刚才Lead消息：闲时void check仍在返回前同步读取历史；改为当前调用返回后的可合并唤醒，关闭后不运行，维持正在check期间的补扫标记。避免每个重复回执排独立扫描。沿用现有setImmediate或同类机制，不建新框架、不改ACK持久顺序、不等待投递。
只改当前范围，无子代理、无E2E/重型检查，回环Vitest由Lead跑。报告temp/final-audit/t176-report03.md，不覆盖已完成report02；Lead回收。明确繁忙轮预检仍可能延迟补投，不声称固定时限。
