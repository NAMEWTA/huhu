import { createHash } from "node:crypto";
import { canonicalJson } from "@huhu/kernel";
import type { HerdrClient } from "@huhu/herdr-client";

interface CoreIdentity {
  id: string;
  generation: number;
}

export interface Terminal {
  address: string;
  argv?: string[];
  cwd?: string;
  labels?: Record<string, string>;
  created_ms?: number;
  pid?: number | null;
  state?: string;
  reason?: string | null;
  exit_code?: number | null;
  finished_ms?: number | null;
}

export interface ProcessBinding {
  address: string;
  createdMs: number;
  pid: number;
}

export interface LaunchAttempt {
  id: string;
  core: CoreIdentity;
  addressHint?: string;
  binding?: ProcessBinding;
  issue?: string;
}

export interface LaunchReceipt {
  vaultId: string;
  machineId: string;
  intentHash: string;
  executionHash: string;
  argvHash: string | null;
  // An empty attempt means no run was sent or Core explicitly rejected it before creation.
  attempt?: LaunchAttempt;
}

export const launchHash = (value: unknown): string => createHash("sha256").update(canonicalJson(value)).digest("hex");

export async function identifyCore(client: HerdrClient): Promise<CoreIdentity> {
  const hello = await client.call<{ core?: { id?: string }; generation?: number }>("hello", { generation: 1 });
  if (!hello.core?.id || hello.generation !== 1) throw new Error("Core did not confirm its identity and protocol generation");
  return { id: hello.core.id, generation: hello.generation };
}

export const sameCore = (a: CoreIdentity, b: CoreIdentity): boolean => a.id === b.id && a.generation === b.generation;

export function launchLabels(vaultId: string, session: { id: string; spaceId: string; requestId: string; launchReceipt?: LaunchReceipt }): Record<string, string> {
  const attempt = session.launchReceipt?.attempt;
  return {
    "huhu.vault": vaultId,
    "huhu.space": session.spaceId,
    "huhu.session": session.id,
    "huhu.launch": session.requestId,
    ...(attempt ? { "huhu.launch.generation": attempt.id } : {}),
  };
}

export const hasLaunchLabels = (terminal: Terminal, labels: Record<string, string>): boolean => Object.entries(labels).every(([key, value]) => terminal.labels?.[key] === value);

export function processBinding(terminal: Terminal): ProcessBinding | null {
  const { address, created_ms, pid, reason } = terminal;
  if (reason === "spawn_pending" || typeof address !== "string" || !address) return null;
  if (typeof created_ms !== "number" || created_ms <= 0 || !Number.isSafeInteger(created_ms)) return null;
  if (typeof pid !== "number" || pid <= 0 || !Number.isSafeInteger(pid)) return null;
  return { address, createdMs: created_ms, pid };
}

export const sameProcess = (a: ProcessBinding, b: ProcessBinding): boolean => a.address === b.address && a.createdMs === b.createdMs && a.pid === b.pid;
