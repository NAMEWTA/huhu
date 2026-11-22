# task18 暂存点

本次先执行同主题的 task19。task18 分支为 `impl/huhu-issues-3-10-mail-data-settings`，基线 `42d332a9083c83c3f3054afc449fd0c01f0b1421`。九个 Mail 路径（含未跟踪文件）已安全保存到 `refs/agent-checkpoints/t17c-task18`，对象 `f4a4c1585ad8a5761afd4eaccb158f9c5baeb460`。暂存后工作树已干净。

## 已完成与已验证

- S7.3 已实现缓存文件统计、内存索引统计、确认清理、旧同步代中断、持久已读覆盖和设置界面。定向 Windows Engine 用例通过，真实回环 IMAP／SMTP 观察到迟到刷新未回写，重启保留草稿附件、已读覆盖、未知投递与凭据，同步重建后恢复搜索。
- 原型确认见 `.agents/dev/changes/2026-11-19-issue-8-mail-module/prototype-review.md`。Modern Web Guidance 已检索并获取 `dialog`、`accessibility`，清理确认采用当前原生 Dialog，初始焦点在取消。

## 恢复

切回 task18 分支并核对干净工作树，执行 `git stash apply refs/agent-checkpoints/t17c-task18`。先按 `dev-build`、`dev-verify` 跑 Mail 全量、TypeScript 和格式，再交 S7.3。S6b.1 尚无代码，复用现有 Huhu v1 包与 Mail 快照接口。按 task18 要求对选定无冲突账号预检及恢复，测试附件、重复、异常、无自动投递。最后发布 report18。
