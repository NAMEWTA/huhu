import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { errors } from "@huhu/contracts";
import { filesystemIdentity } from "@huhu/vault";

export type ApprovedLinuxShell = {
  executable: { path: string; identity: string; birthtimeNs: string; ctimeNs: string; mtimeNs: string; size: string; sha256: string };
  argv: [executable: string, flag: "-c", command: string];
};

/** External sh approval is for the system shell; ambient PATH has no role in selecting it. */
export function inspectLinuxShell(command: string): ApprovedLinuxShell {
  try {
    if (process.platform !== "linux") throw new Error("Linux is required");
    const path = realpathSync.native("/bin/sh");
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd, { bigint: true });
      const identity = filesystemIdentity(before);
      // Reject writable overlays and scripts whose interpreter would be resolved again.
      const uid = process.geteuid?.();
      const appOwnsFile = uid !== undefined && uid !== 0 && before.uid === BigInt(uid);
      if (!identity || !before.isFile() || appOwnsFile || (before.mode & 0o022n) !== 0n || (before.mode & 0o111n) === 0n) throw new Error("Untrusted image");
      const bytes = readFileSync(fd);
      const after = fstatSync(fd, { bigint: true });
      if (bytes.readUInt32BE(0) !== 0x7f454c46 || before.ctimeNs !== after.ctimeNs || before.mtimeNs !== after.mtimeNs || before.size !== after.size)
        throw new Error("Shell image changed or is not ELF");
      const executable = {
        path,
        identity,
        birthtimeNs: String(before.birthtimeNs),
        ctimeNs: String(before.ctimeNs),
        mtimeNs: String(before.mtimeNs),
        size: String(before.size),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
      return { executable, argv: [path, "-c", command] };
    } finally {
      closeSync(fd);
    }
  } catch {
    throw errors.permissionDenied("无法核对 Linux 系统 sh 的可执行文件");
  }
}
