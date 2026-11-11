# 复制来源台账

| 编号 | 来源 | 提交 | 目标路径 | 说明 |
| --- | --- | --- | --- | --- |
| R-05 | DSH fcc0ad4 | vendor/{cordis,cosmokit,timer}/src/* | vendor/{cordis,cosmokit,timer}/src/* | 包名改为 @huhu/*，保留 MIT 许可文件与来源行 |
| R-08 | OK 44a2e0a | packages/server/src/file-watcher.ts | packages/vault/src/watch/ | 仅参照批处理/回退/重命名配对思路，按 HUHU 需求精简重写（模式，未复制代码） |
| R-09 | atomic-editor b6ed65f (kenforthewin, 0.6.2) | src/* | packages/editor/src/vendor/atomic/ | 复制并改造（inline-preview、wiki-links、主题、IME 组合保护），保留 MIT 许可文件与来源说明 `UPSTREAM.md` |
| R-24 | open-knowledge 批注锚点 | packages/server/src/comments/anchor.ts、packages/core/src/comments/{passage-match}.ts、markdown/whitespace-char-ref.ts | plugins/notes/src/engine/comments/ | 复制（GPL-3.0-or-later，与本项目许可一致）；类型改为本地 Anchor，删除未使用导出，补 noUncheckedIndexedAccess 守卫 |
