# task08 · A07 拖放落到过期树行时静默重建已移走的文件夹

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-session`，分支 `closeout/issue2-session`。
开始前先 `git merge --ff-only closeout/issue2-integration`（应快进到 471dfdf），在其上提交。

## 现象（Lead 已定位）
最终候选 471dfdf 全量 e2e 中 `tests/e2e/workflows/acceptance.spec.ts:618` 失败一次（第 640 行：`目标/甲/里面的笔记.md` 不存在，且无 alert）；单跑 3/3、6 worker 压测 24/24 通过。
根因推断：第一次拖放 `甲 → 目标` 后，磁盘已变但树还没按合并后的文件事件重新列举，第二次拖放 `目标 → 甲` 时 `treeFolder(page,"甲").first()` 命中了过期的根级「甲」行。
filesDeps.rename 调 `notes.move { path:"目标", targetDir:"甲" }`；`service.ts` `moveEntry` 的自身/后代检查放过（`甲/目标` 不以 `目标/` 开头），随后 `mkdirSync(dirname(to), {recursive:true})` 把已移走的「甲」在根目录重建，`目标` 被整体搬进去，无任何提示。

## 要求
1. 产品：`notes.move`（`service.move`）在 `targetDir` 非空且不是现存目录时拒绝（`errors.notFound` 或现有更合适的错误码，中文消息如「目标文件夹不存在：…」），不得创建目标目录。不要改 `moveEntry` 的档案层调用语义（档案层自行计算目标）；如判断应放在别处，报告理由。
   UI 拖放落在过期行时应得到可见错误或被忽略，磁盘不变。
2. 单测：引擎层覆盖「目标文件夹不存在 → 拒绝且磁盘不变」与「根目录 targetDir=""」仍可用。
3. e2e：`acceptance.spec.ts:618` 在第二次拖放前等树稳定（`helpers/tree.ts` 的 `treeSettled`，或等根级「甲」消失、`目标` 下出现「甲」），并保留「不能拖进自己的后代」的断言。另加一段可确定复现过期目标的验证（例如通过 `caller` 直接调 `notes.move` 到已不存在的目录，断言报错、磁盘不变）。
4. 验证：受影响单测、`pnpm typecheck`、`pnpm lint`、`xvfb-run -a pnpm exec playwright test tests/e2e/workflows/acceptance.spec.ts --retries=0`，以及 `:618` `--repeat-each=20 --workers=6 --retries=0`。
5. 写入范围：`plugins/notes/src/engine/service.ts`（或 `index.ts` 中 notes.move 处）、对应单测文件、`tests/e2e/workflows/acceptance.spec.ts`。其余文件不改；如需改，先在报告里说明。

## 回报
写 `report08.md`：提交 SHA、改动、命令与结果（如实写失败/重跑）、对 MoveDialog 和树内改名路径不受影响的核对。
