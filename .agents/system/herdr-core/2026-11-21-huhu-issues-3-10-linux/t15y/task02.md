# t15y/task02
Lead t3p，继续独立审查，读取topic/manifest。integration工作树基线05a748b6。只读业务、无子代理、不跑重型验证。审查两个独立改动：
1. tests/e2e/perf.spec.ts 10MiB测试返工：searchbox角色，tee真实10MiB并输出字节计数，实际终端输出开始至结束按keydown时间纳样，等待所有已开始样本的两帧回调，交替a/Backspace避免maxlength。上次报告的慢样本遗漏等是否解决，有无错误过绿。至少10和100ms不变。
2. plugins/notes/src/engine/index.ts notes.save追加vault.fileChanged及新plugins/notes/test/document-events.engine.test.ts。真实Web保存后desktop不刷新：../agent-linux旧包经修订helper已越过身份校验，integration/temp/final-audit/candidate-profile-recheck-05a.log业务失败；NotesModule订阅fileChanged，而watcher过滤本进程echo。新test红灯document-events-red.log、绿灯document-events-check.log(2pass)。核查自己的保存通知、路径规范化、脏稿/回执竞态是否回归。可阅读现有DocumentSession，不修改。
仅写 integration/temp/final-audit/t15y-report02.md，Lead主动读取，不需hc send。给真实问题和可执行建议，未运行UI等明确标注。
