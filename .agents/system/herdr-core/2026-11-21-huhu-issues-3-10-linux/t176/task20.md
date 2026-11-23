# task20 停放文档恢复时核对磁盘
Lead t3p；worker t176；cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。
根据report19先用现有FakeEngine在 plugins/notes/test/document-session.test.ts 复现仅剩park引用时错过外部写入事件，再获取活动租约仍旧正文。按客户端任务先执行zh-modern-web-guidance流程。修复范围限 plugins/notes/src/ui/documents/DocumentSessionRegistry.ts、必要的DocumentSession.ts及上述测试，尽量复用现有 guarded reload/冲突检测。不增加无条件重复读取或自动保存，不覆盖脏输入/恢复草稿，不改editor/provider基础设施。若最小方案无法满足需先说明。
验证重点：干净恢复最新文本版本；脏会话/草稿/恢复期间新输入保留；零额外notes.save；已有save生命周期单文件全部通过。只跑该单文件vitest和定向静态，不跑E2E/build/全仓检查，不提交，不启动agent。Lead原同包web-share是实际回归入口，不改其断言。
产物 temp/final-audit/t176-report20.md，含红绿、行为边界、未运行验证。hc send t3p回告；无权限只写本地报告即可，无需请求升级。
