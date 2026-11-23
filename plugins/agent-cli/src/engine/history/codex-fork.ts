import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { isUuidHistoryId, isWithin, nativeHistoryCandidates } from "./scanner.js";
import type { ProcessBinding } from "../launch-binding.js";

interface CodexHistoryPlan {
  command: string;
  commandTarget: string;
  helper: string;
  node: string;
  argv: string[];
  file: string;
  profile: string;
  cwd: string;
  nativeId: string;
  mode: "resume" | "fork";
  commandStamp: string;
  helperStamp: string;
  fileStamp: string;
}

export interface CodexHistoryReceipt {
  directory: string;
  secret: string;
}

function stamp(file: string): string {
  const stat = statSync(file, { bigint: true });
  if (!stat.isFile() || realpathSync(file) !== file) throw new Error("File changed");
  return [stat.dev, stat.ino, stat.birthtimeNs, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}

export function prepareCodexHistory([command, ...argv]: string[], source: Pick<CodexHistoryPlan, "file" | "profile" | "cwd" | "nativeId" | "mode">, runtime: { node: string; helper: string }): CodexHistoryPlan {
  try {
    if (!command || !path.isAbsolute(command) || argv[0] !== "resume" || argv[1] !== source.nativeId) throw new Error("Unexpected command");
    // Named entry points such as Volta need the original basename when launched.
    const commandTarget = realpathSync(command);
    const helper = realpathSync(runtime.helper);
    return { ...source, argv, command, commandTarget, helper, node: realpathSync(runtime.node), commandStamp: stamp(commandTarget), helperStamp: stamp(helper), fileStamp: stamp(source.file) };
  } catch {
    throw errors.invalidInput("无法为原生 Codex 历史绑定本机程序和来源文件");
  }
}

export function stageCodexHistory(plan: CodexHistoryPlan, root: string, attempt: string): { argv: string[]; receipt: CodexHistoryReceipt } {
  const directory = path.join(root, "history-launch", attempt);
  mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 });
  const secret = randomBytes(32).toString("hex");
  const config = path.join(directory, "launch.json");
  writeFileSync(config, JSON.stringify({ ...plan, attempt, secret }), { flag: "wx", mode: 0o600, flush: true });
  return { argv: [plan.node, plan.helper, "--history", config], receipt: { directory, secret } };
}

export function readCodexHistoryReceipt(receipt: CodexHistoryReceipt, attempt: string, binding: ProcessBinding, source: Pick<CodexHistoryPlan, "nativeId" | "file" | "profile" | "cwd" | "mode">): { id: string; file: string } | undefined {
  try {
    const { data, mac } = JSON.parse(readFileSync(path.join(receipt.directory, source.mode + ".json"), "utf8")) as {
      data: { attempt: string; address: string; pid: number; parent: string; source: string; id: string; file: string; cwd: string };
      mac: string;
    };
    const expected = createHmac("sha256", Buffer.from(receipt.secret, "hex"))
      .update(JSON.stringify([source.mode, data]))
      .digest();
    if (!/^[a-f0-9]{64}$/.test(mac) || !timingSafeEqual(Buffer.from(mac, "hex"), expected)) return undefined;
    if (data.attempt !== attempt || data.address !== binding.address || data.pid !== binding.pid || data.parent !== source.nativeId || data.source !== source.file || data.cwd !== source.cwd) return undefined;
    if (source.mode === "resume") return data.id === source.nativeId && data.file === source.file ? { id: data.id, file: data.file } : undefined;
    if (!isUuidHistoryId(data.id) || data.id.toLowerCase() === source.nativeId.toLowerCase() || !isWithin(path.join(source.profile, "sessions"), data.file)) return undefined;
    if (nativeHistoryCandidates("codex", source.profile)?.get(data.id.toLowerCase()) !== data.file) return undefined;
    return { id: data.id, file: data.file };
  } catch {
    return undefined;
  }
}
