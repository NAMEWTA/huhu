// 子进程：在指定步骤发布后或确认后以 process.exit 模拟崩溃。
import { VaultFiles, OperationLog } from "../../src/index.ts";

const [root, opsDir, crashAfter, timing = "afterStep"] = process.argv.slice(2);
const files = new VaultFiles(root);
const log = new OperationLog(files, opsDir);
await log.run(
  "op1",
  "test",
  [
    { action: "write", path: "a.md", bytes: Buffer.from("A-new") },
    { action: "delete", path: "b.md" },
    { action: "rename", from: "c.md", path: "d.md" },
    { action: "write", path: "e.md", bytes: Buffer.from("E-new") },
  ],
  {
    [timing]: (i) => {
      if (i === Number(crashAfter)) process.exit(7);
    },
  },
);
