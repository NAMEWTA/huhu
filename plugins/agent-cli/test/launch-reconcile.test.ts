import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { afterEach, expect, test } from "vitest";
import { SessionsService, type LaunchInput, type SessionsDeps } from "../src/engine/sessions.js";
import { SpaceStore } from "../src/engine/spaces.js";

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "h80-reconcile-")));
  scratch.push(root);
  const dir = path.join(root, "sessions");
  mkdirSync(dir);
  const cwd = path.join(root, "合成 工作区");
  mkdirSync(cwd);
  const spaces = new SpaceStore(path.join(root, "spaces"), "machine-1");
  const space = spaces.save({ name: "Workspace", root: cwd });
  const target = { spaceId: space.id, spaceRevision: space.revision, cwd, provider: "claude", requestId: "request-v1", prompt: "two words" } satisfies LaunchInput;
  const params = { cwd, argv: ["synthetic.cmd", "two words"], labels: {} as Record<string, string> };
  const terminal = { ...params, address: "t1", created_ms: 101, pid: 123 as number | null, state: "live" as string | undefined, reason: null as string | null, finished_ms: null as number | null, exit_code: null as number | null };
  const terminals: (typeof terminal)[] = [];
  const fake = { tries: 0, fail: null as "before-send" | "rejected" | "lost" | "spawn-timeout" | null, listFails: false, coreId: "core-id", generation: 1, args: ["two words"] };
  const client = {
    call: async (method: string, input?: typeof params) => {
      if (method === "hello") return { core: { id: fake.coreId }, generation: fake.generation };
      if (method === "terminal.list") {
        if (fake.listFails) throw new Error("list unavailable");
        return { terminals }; // Deliberately ignores server-side filters so the caller must check identity.
      }
      if (method === "terminal.run") {
        fake.tries++;
        if (fake.fail === "rejected") throw new HerdrError({ code: -32602, data: { kind: "invalid_params" }, message: "invalid params" });
        if (fake.fail === "spawn-timeout") throw new HerdrError({ code: -32000, data: { kind: "spawn_failed" }, message: "the holder did not answer" });
        const result = { ...terminal, ...input };
        terminals.push(result);
        if (fake.fail === "lost") throw new Error("run reply lost");
        return result;
      }
      throw new Error(method);
    },
  } as unknown as HerdrClient;
  const deps: SessionsDeps = {
    dir,
    spaces,
    vaultId: "vault-current",
    core: async () => {
      if (fake.fail === "before-send") throw new HuhuError("HERDR_UNAVAILABLE", "not connected");
      return client;
    },
    peekCore: async () => client,
    resolve: async () => ({ command: "synthetic.cmd", argv: fake.args, env: {}, warnings: [] }),
    now: () => new Date("2026-11-20T00:00:00Z"),
  };
  const reopen = (over: Partial<SessionsDeps> = {}) => new SessionsService({ ...deps, ...over });
  return { dir, target, terminal, terminals, fake, reopen, spaces };
}

test("same intent dedupes across reopens, while target, cwd, provider and resolved argv changes conflict", async () => {
  const { dir, fake, reopen, spaces, target, terminals } = fixture();
  const original = await reopen().launch(target);
  expect(await reopen().launch({ ...target, cwd: path.toNamespacedPath(target.cwd) })).toMatchObject({ id: original.id, terminalId: original.terminalId });
  const sub = path.join(target.cwd, "sub");
  mkdirSync(sub);
  const other = spaces.save({ name: "Other", root: sub });
  for (const input of [
    { ...target, spaceId: other.id, spaceRevision: other.revision },
    { ...target, cwd: sub },
    { ...target, provider: "codex" as const },
    { ...target, prompt: "changed" },
  ]) {
    await expect(reopen().launch(input)).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  }
  fake.args = ["two", "words"];
  await expect(reopen().launch(target)).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  const persisted = readFileSync(path.join(dir, `${original.id}.json`), "utf8");
  expect(persisted).not.toContain("two words");
  expect(persisted).not.toContain("synthetic.cmd");
  expect(fake.tries).toBe(1);
  expect(terminals).toHaveLength(1);
});

test("concurrent same-key different intent conflicts before a second run", async () => {
  const { fake, target, reopen } = fixture();
  const service = reopen();
  const first = service.launch(target);
  const different = service.launch({ ...target, provider: "codex" });
  const assertion = expect(different).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  expect(await first).toMatchObject({ state: "running" });
  await assertion;
  expect(fake.tries).toBe(1);
});

test("a candidate needs an explicit lifecycle compatible with its exit fields", async () => {
  const { fake, target, terminals, reopen } = fixture();
  fake.fail = "lost";
  fake.listFails = true;
  await expect(reopen().launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  const [real] = terminals.splice(0);
  fake.listFails = false;
  for (const terminal of [
    { ...real!, state: undefined },
    { ...real!, state: "live", finished_ms: 202 },
    { ...real!, state: "finished" },
  ]) {
    terminals.splice(0, terminals.length, terminal);
    await expect(reopen().launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN", details: { reason: "process_unverified" } });
  }
  terminals.splice(0, terminals.length, { ...real!, state: "finished", finished_ms: 202, exit_code: 7 });
  expect(await reopen().launch(target)).toMatchObject({ terminalId: real!.address, state: "exited", exitCode: 7 });
  expect(fake.tries).toBe(1);
});

test.skipIf(process.platform !== "win32")("replays the literal junction spelling only when the old target can no longer resolve", async () => {
  const { fake, target, reopen } = fixture();
  const first = path.join(target.cwd, "first");
  const other = path.join(target.cwd, "other");
  const junction = path.join(target.cwd, "junction");
  mkdirSync(first);
  mkdirSync(other);
  symlinkSync(first, junction, "junction");
  const input = { ...target, cwd: junction };
  const original = await reopen().launch(input);
  expect(original.cwd).toBe(first);
  rmSync(junction);
  expect(await reopen().launch(input)).toMatchObject({ id: original.id, terminalId: original.terminalId, cwd: first });
  await expect(reopen().launch({ ...input, cwd: junction + "-other" })).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  symlinkSync(other, junction, "junction");
  await expect(reopen().launch(input)).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  expect(fake.tries).toBe(1);
});

test("an unreadable pre-index receipt cannot be treated as proof of a fresh request", async () => {
  const { dir, fake, target, reopen } = fixture();
  const original = await reopen().launch(target);
  const index = path.join(path.dirname(dir), "launch-requests");
  for (const name of readdirSync(index)) rmSync(path.join(index, name));
  writeFileSync(path.join(dir, original.id + ".json"), '{"id":');
  await expect(reopen().launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN", details: { reason: "launch_receipt_unavailable" } });
  expect(fake.tries).toBe(1);
});

test.each(["empty", "list failure", "multiple", "spawn pending", "holder timeout"] as const)("leaves %s unresolved across reopen and only binds a unique verified process", async (scenario) => {
  const { fake, target, terminals, reopen } = fixture();
  fake.fail = scenario === "holder timeout" ? "spawn-timeout" : "lost";
  fake.listFails = true;
  const first = reopen();
  await expect(first.launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN", retryable: true });
  const [record] = first.list();
  expect(record).toMatchObject({ state: "unknown", terminalId: null });
  fake.listFails = scenario === "list failure";
  const [created] = terminals.splice(0);
  if (scenario === "multiple") terminals.push(created!, { ...created!, address: "t2", pid: 125 });
  if (scenario === "spawn pending") terminals.push({ ...created!, reason: "spawn_pending", pid: null });
  const second = reopen();
  await second.reconcile();
  expect(second.list()).toMatchObject([{ id: record!.id, state: "unknown", terminalId: null }]);
  const reason = { empty: "no_match", "list failure": "snapshot_unavailable", multiple: "multiple_matches", "spawn pending": "spawn_pending", "holder timeout": "no_match" }[scenario];
  await expect(second.launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN", details: { sessionId: record!.id, reason } });
  expect(fake.tries).toBe(1);
  if (!created) return;
  fake.listFails = false;
  terminals.splice(0, terminals.length, created);
  expect(await reopen().launch(target)).toMatchObject({ id: record!.id, state: "running", terminalId: created.address });
  expect(fake.tries).toBe(1);
});

test.each(["before-send", "rejected"] as const)("same operation can create after %s proves no spawn", async (kind) => {
  const { target, fake, terminals, reopen } = fixture();
  fake.fail = kind;
  const first = reopen();
  await expect(first.launch(target)).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE" });
  const [record] = first.list();
  expect(record).toMatchObject({ state: "failed", terminalId: null });
  expect(terminals).toHaveLength(0);
  fake.fail = null;
  expect(await reopen().launch(target)).toMatchObject({ id: record!.id, state: "running", terminalId: "t1" });
  expect(terminals).toHaveLength(1);
});

test("never adopts foreign Vault, attempt or Core generation after a lost response", async () => {
  const { target, fake, terminals, reopen } = fixture();
  fake.fail = "lost";
  fake.listFails = true;
  await expect(reopen().launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  fake.listFails = false;
  const [created] = terminals.splice(0);
  for (const label of ["huhu.vault", "huhu.space", "huhu.session", "huhu.launch", "huhu.launch.generation"]) {
    terminals.splice(0, terminals.length, { ...created!, labels: { ...created!.labels, [label]: "foreign" } });
    await expect(reopen().launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  }
  terminals.splice(0, terminals.length, created!);
  fake.coreId = "another-core";
  await expect(reopen().launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  fake.coreId = "core-id";
  fake.generation = 2;
  await expect(reopen().launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  expect(fake.tries).toBe(1);
});

test("a reused address or copied Vault record cannot be treated as the original running binding", async () => {
  const { dir, target, fake, terminals, reopen } = fixture();
  const session = await reopen().launch(target);
  const [original] = terminals;
  terminals[0] = { ...original!, created_ms: 500, pid: 178 };
  const second = reopen();
  await expect(second.kill(session.id)).rejects.toMatchObject({ code: "RUN_UNKNOWN", details: { reason: "binding_lost" } });
  await expect(second.launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  expect(second.list()[0]).toMatchObject({ id: session.id, state: "unknown", terminalId: null });
  expect(fake.tries).toBe(1);
  const copied = path.join(path.dirname(dir), "copied");
  mkdirSync(copied);
  copyFileSync(path.join(dir, `${session.id}.json`), path.join(copied, `${session.id}.json`));
  const otherVault = reopen({ dir: copied, vaultId: "vault-other" });
  expect(otherVault.list()).toEqual([]);
  const otherMachine = reopen({ dir: copied, spaces: new SpaceStore(path.join(copied, "spaces"), "machine-other") });
  expect(otherMachine.list()).toEqual([]);
});
