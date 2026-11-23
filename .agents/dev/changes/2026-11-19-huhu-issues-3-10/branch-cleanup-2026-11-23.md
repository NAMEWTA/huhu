# 分支清理与恢复记录

用户要求将有效实现统一到 main，并删除本地及远端多余分支。本轮生产代码仍为 d056eb63 中已验收版本；根目录旧 Notes / Archive / 手动保存 E2E 片段已有后续实现，不回写旧文件。新增提交保存根目录待提交的 Herdr Core 技能整合、Claude 模型偏好、协作 task/report/manifest/topic，以及漏在旧工作树中的两项裁决记录。

## 引用审计

清理前本地非 main 分支 120 个：59 个已按祖先关系合入；40 个剩余提交的补丁与 main 等价；21 个含修改后集成的提交或旧暂停快照。原 SHA 和分类见 cleanup-refs-before.txt、cleanup-branch-audit.json；非等价原提交与同标题集成提交的对应见 cleanup-unmatched-commits.json。后续修正可能改变补丁身份，不以原 SHA 未出现在 main 判断功能未实现。SSH 文件会话/版本编辑已由 0d279330 集成，代理、证书、快捷文本、批量路由已在后续集成提交中演进；暂停快照不覆盖生产代码。

## 无分支恢复资料

所有不在 origin/main 祖先中的分支引用及根目录暂存快照保存在 `retired-branches.bundle`，包含原始提交、树和 blob。它只作为归档文件，不向当前 graph 注入旧分支。SHA-256：`3d7d1de50e056d16cdc09260fcad2106005e51af9a61c8c9c2efe8f054e0e0a3`。已在本仓库执行 `git bundle verify`；这是增量 bundle，需要当前 main 已有历史作为前置对象。

需要恢复某一分支时，在本仓库中执行：

```bash
git bundle list-heads .agents/dev/changes/2026-11-19-huhu-issues-3-10/retired-branches.bundle
git fetch .agents/dev/changes/2026-11-19-huhu-issues-3-10/retired-branches.bundle refs/heads/<原分支名>:refs/heads/<恢复分支名>
```

原 SSH stash `19f86bbd` 单独保存在 `../2026-11-19-issue-7-ssh-module/evidence/paused-snapshots/ssh-stash.bundle`，可用 `git fetch <bundle路径> refs/archive/huhu-paused-ssh-stash:refs/heads/restored-ssh-stash` 恢复。原 resume-linux 的未完成 SSH 合并另存于 `../2026-11-19-issue-7-ssh-module/evidence/paused-snapshots/`：原工作文件 tar、三阶段 index 清单、staged/unstaged diff 和状态。原暂停 change 与已集成 SSH 代码仍在 main，未开展新 SSH 开发。仓库外完整引用备份及每个工作树的 diff/untracked 快照位于 `/home/wta/projects/huhu-git-cleanup-2026-11-23/`。

只删除分支引用和已归档 stash；附加工作树转为 detached，保留安装包、证据、忽略文件和本地依赖。保留 main、远端默认分支标识和已有 tag。不重写已发布提交，不强推 main。当前清理仅增加资料与配置，不改变产品代码，复用既有固定包验收。
