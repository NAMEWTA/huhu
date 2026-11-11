// 子进程：执行多文件操作，在第 N 步完成后以 process.exit 模拟崩溃。
import { VaultFiles, OperationLog } from "../../src/index.ts";

const [root, opsDir, crashAfter] = process.argv.slice(2);
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
    afterStep: (i) => {
      if (i === Number(crashAfter)) process.exit(7);
    },
  },
);
