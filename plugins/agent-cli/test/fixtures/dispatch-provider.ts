import type { SpawnSyncReturns } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import type { DispatchProvider } from "../../src/engine/dispatch.js";

type Reading = { pid: number; dispatchId: string; sha256: string; proof: boolean };

export function createFixtureGate() {
  let enter!: () => void;
  let resume!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    resume = resolve;
  });
  return {
    entered,
    resume,
    wait: () => {
      enter();
      return blocked;
    },
  };
}

export function readFixtureJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function createDispatchProviderFixture(sandbox: string, cli: (...args: string[]) => Pick<SpawnSyncReturns<string>, "status" | "stdout">) {
  const proofDir = path.join(sandbox, "proof");
  mkdirSync(proofDir);
  const script = path.join(sandbox, "synthetic.mjs");
  writeFileSync(
    script,
    `
    import { createHash } from "node:crypto";
    import { appendFileSync, writeFileSync } from "node:fs";
    import { createInterface } from "node:readline";
    import path from "node:path";
    const dir = process.argv[2];
    const address = process.env.HC_TERMINAL_ID;
    const line = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    writeFileSync(path.join(dir, address + ".ready.json"), JSON.stringify({ pid: process.pid }));
    for await (const text of line) {
      let message;
      try { message = JSON.parse(text); } catch { continue; }
      if (message.kind !== "fixture-task") continue;
      appendFileSync(path.join(dir, address + ".jsonl"), JSON.stringify({
        pid: process.pid, dispatchId: message.dispatchId, sha256: createHash("sha256").update(text).digest("hex"), proof: !message.exitWithoutProof
      }) + "\\n");
      if (message.exitWithoutProof) process.exit(0);
    }
  `,
  );
  const readers = (address: string): Reading[] => {
    try {
      return readFileSync(path.join(proofDir, address + ".jsonl"), "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Reading);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  };
  const pidOf = (address: string): number | undefined => {
    const result = cli("get", address);
    return result.status === 0 ? (JSON.parse(result.stdout) as { pid?: number }).pid : undefined;
  };
  const controls: { allowProof: boolean; allowReady: boolean; blockReady?: (() => Promise<void>) | undefined; readySignal?: AbortSignal; afterReady?: (() => void) | undefined } = {
    allowProof: true,
    allowReady: true,
  };
  const adapter: DispatchProvider = {
    id: "isolated-node-line-protocol-v1",
    modes: ["new", "existing"],
    async ready(binding, signal) {
      const gate = controls.blockReady;
      controls.blockReady = undefined;
      if (gate) controls.readySignal = signal;
      await gate?.();
      if (!controls.allowReady) return false;
      const pid = pidOf(binding.coreAddress);
      if (!pid) return false;
      for (let i = 0; i < 60; i++) {
        if (readFixtureJson<{ pid: number }>(path.join(proofDir, binding.coreAddress + ".ready.json"))?.pid === pid) {
          controls.afterReady?.();
          controls.afterReady = undefined;
          return true;
        }
        await pause(40, undefined, { signal });
      }
      return false;
    },
    async acceptance(execution, inputSha256, signal) {
      if (!controls.allowProof) return null;
      const address = execution.sessionBinding.coreAddress;
      const pid = pidOf(address);
      for (let i = 0; i < 30; i++) {
        const match = readers(address).find((entry) => entry.proof && entry.pid === pid && entry.dispatchId === execution.dispatchId && entry.sha256 === inputSha256);
        if (match) return { id: execution.dispatchId + "-received", execution, inputSha256 };
        await pause(25, undefined, { signal });
      }
      return null;
    },
  };
  return { adapter, controls, pidOf, proofDir, readers, script };
}
