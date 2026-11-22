import { spawn } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";
import { remoteArchiveProbe } from "../src/engine/public-archives.js";
import type { FakeSshOptions } from "./fake-server.js";

export function ownedArchiveFixture(root: string, onCommand?: (phase: "probe" | "run") => void): Pick<FakeSshOptions, "onInteractiveExec" | "onStat"> {
  return {
    onInteractiveExec: (command, channel) => {
      if (!command.startsWith("exec python3 -I -B -c ")) return false;
      onCommand?.(command === remoteArchiveProbe ? "probe" : "run");
      const child = spawn("sh", ["-c", command], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.pipe(channel, { end: false });
      child.stderr.pipe(channel.stderr, { end: false });
      child.once("close", (code) => {
        channel.exit(code ?? 1);
        channel.end();
      });
      channel.once("close", () => child.kill());
      return true;
    },
    onStat: (candidate) => {
      if (!candidate.startsWith(root + path.sep)) return undefined;
      const st = lstatSync(candidate, { throwIfNoEntry: false });
      if (!st) return undefined;
      return { mode: st.mode, size: st.size, uid: st.uid, gid: st.gid, mtime: Math.floor(st.mtimeMs / 1000), atime: Math.floor(st.atimeMs / 1000) };
    },
  };
}
