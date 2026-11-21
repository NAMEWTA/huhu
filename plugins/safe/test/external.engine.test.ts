import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { CapabilityResultSchema, type CapabilityResult } from "@huhu/contracts";
import { expect, test as engineTest, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { Safe } from "../src/engine/safe.js";
import { writeLegacyItem } from "./legacy-fixture.js";
import { signal } from "./signal.js";

const cliDir = path.resolve(import.meta.dirname, "../../../apps/cli");
const sessionOf = ({ instanceId, generation, callerProof }: Status) => ({ instanceId, generation, ...(callerProof && { callerProof }) });
type Status = { instanceId: string; generation: number; callerProof?: string; locked: boolean };
type Created = { entryId: string; revision: number; accountIds: string[] };
type Entry = { entryId: string; revision: number; name: string; accounts: { accountId: string; hasPassword: boolean }[] };
type Rpc = { id: number; result?: { tools?: { name: string }[]; structuredContent?: { data?: unknown }; isError?: boolean; content?: Array<{ text?: string }> } };

function urlOf(engine: RunningEngine) {
  return `http://127.0.0.1:${engine.port}`;
}

function success<T>(reply: CapabilityResult<unknown>): T {
  if (!reply.ok) throw new Error(`Safe fixture call failed with ${reply.error.code}`);
  return reply.data as T;
}

function requestResponse(engine: RunningEngine, token: string, capability: string, input: unknown = {}, key: string = randomUUID(), intentKey?: string) {
  return fetch(`${urlOf(engine)}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: key, ...(intentKey && { intentKey }) }),
  });
}

async function request(...args: Parameters<typeof requestResponse>) {
  const response = await requestResponse(...args);
  if (!response.ok) throw new Error(`Safe fixture HTTP ${response.status}`);
  return CapabilityResultSchema.parse(await response.json());
}

async function fixture(run: (open: (options?: { webAssetsDir?: string }) => Promise<RunningEngine>, temp: string) => Promise<void>) {
  const parent = realpathSync.native(tmpdir());
  const temp = mkdtempSync(path.join(parent, "huhu-safe-external-"));
  const engines: RunningEngine[] = [];
  try {
    await run(async (options = {}) => {
      const vaultPath = mkdtempSync(path.join(parent, "huhu-safe-external-vault-"));
      try {
        const engine = await boot({ vaultPath, create: true, ...options });
        engines.push(engine);
        return engine;
      } catch (error) {
        rmSync(vaultPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        throw error;
      }
    }, temp);
  } finally {
    vi.restoreAllMocks();
    for (const engine of engines) {
      await engine.shutdown();
      if (path.dirname(engine.vault.root) === parent && path.basename(engine.vault.root).startsWith("huhu-safe-external-vault-")) rmSync(engine.vault.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function expectCode(reply: CapabilityResult<unknown>, code: string) {
  expect(reply.ok ? "unexpected-success" : reply.error.code).toBe(code);
}

async function started<T>(entered: Promise<void>, operation: Promise<T>) {
  if (!(await Promise.race([entered.then(() => true), operation.then(() => false)]))) throw new Error("Safe fixture completed before reaching the intended boundary");
}

function cliProcess(args: string[]) {
  const tsx = createRequire(path.join(cliDir, "package.json")).resolve("tsx/cli");
  return spawn(process.execPath, [tsx, path.join(cliDir, "src/bin.ts"), ...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, timeout: 20_000 });
}

async function cli(engine: RunningEngine, capability: string, input: unknown) {
  const child = cliProcess(["call", capability, "--input-file", "-", "--vault", engine.vault.root, "--json"]);
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.once("close", resolve);
  });
  let out = "",
    err = "";
  child.stdout.setEncoding("utf8").on("data", (text: string) => {
    out += text;
  });
  child.stderr.setEncoding("utf8").on("data", (text: string) => {
    err += text;
  });
  child.stdin.end(Buffer.from(JSON.stringify(input), "utf8"));
  const code = await exited;
  if ((code !== 0 && code !== 1) || err) throw new Error("Safe CLI fixture did not return its JSON envelope");
  return CapabilityResultSchema.parse(JSON.parse(out));
}

async function withStdio(engine: RunningEngine, use: (send: (method: string, params?: object) => Promise<Rpc>) => Promise<void>) {
  const child = cliProcess(["mcp", "--vault", engine.vault.root]);
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, { resolve(reply: Rpc): void; reject(error: Error): void }>();
  const exited = signal();
  const stop = () => {
    for (const reply of pending.values()) reply.reject(new Error("Safe MCP stdio fixture exited before reply"));
    pending.clear();
    exited.resolve();
  };
  child.once("error", stop);
  child.once("close", stop);
  child.stderr.resume(); // Do not forward transport diagnostics or protocol data to evidence.
  lines.on("line", (line) => {
    try {
      const reply = JSON.parse(line) as Rpc;
      pending.get(reply.id)?.resolve(reply);
      pending.delete(reply.id);
    } catch {
      stop();
    }
  });
  let id = 0;
  const send = (method: string, params?: object) =>
    new Promise<Rpc>((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params, id }) + "\n");
    });
  try {
    const initialized = await send("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "safe-fixture", version: "1" } });
    expect(initialized.result !== undefined).toBe(true);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    await use(send);
  } finally {
    lines.close();
    child.stdin.end();
    child.kill();
    await exited.promise;
  }
}

function containsPrivateBytes(root: string, needles: string[]): boolean {
  return readdirSync(root, { withFileTypes: true }).some((entry) => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return containsPrivateBytes(file, needles);
    if (!entry.isFile()) return false;
    const bytes = readFileSync(file);
    return needles.some((needle) => bytes.includes(needle));
  });
}

engineTest(
  "同一保险箱条目经工作台、CLI stdin、HTTP 与两种 MCP 修改和读取，逐项授权可撤销",
  async () => {
    await fixture(async (open) => {
      const e = await open();
      const desktop = (capability: string, input: unknown = {}) => request(e, e.rendererToken, capability, input);
      const allow = async (capability: string, exposed: boolean) => {
        expect(success(await desktop("gateway.update", { capability, exposed }))).toMatchObject({ exposed });
      };
      const makeHttp = async () => success<{ token: string; id: string }>(await desktop("gateway.tokens.create", { name: "safe synthetic tool" }));
      const http = await makeHttp();
      const other = await makeHttp();
      const httpCall = (name: string, input: unknown = {}, key?: string) => request(e, http.token, name, input, key);
      const discovery = async (token: string) => ((await (await fetch(`${urlOf(e)}/api/v1/capabilities`, { headers: { authorization: `Bearer ${token}` } })).json()) as { name: string }[]).map(({ name }) => name);

      const masterPassword = randomUUID(),
        secret = randomUUID(),
        otherSecret = randomUUID(),
        replacement = randomUUID();
      const legacy = await writeLegacyItem(e.vault.root, { masterPassword, value: randomUUID(), type: "token", allowedModules: ["ssh"] });
      const originalLegacy = [legacy.metadataPath, legacy.sealedPath].map((file) => readFileSync(file));
      expectCode(await desktop("safe.items.save", { allowedModules: ["ssh"] }), "CAPABILITY_NOT_FOUND");
      expectCode(await desktop("safe.items.reveal", { id: legacy.id }), "CAPABILITY_NOT_FOUND");
      // Use an independently created current-format Safe for the cross-entry test.
      const live = await open();
      const control = (name: string, input: unknown = {}) => request(live, live.rendererToken, name, input);
      const set = async (capability: string, exposed: boolean) => success(await control("gateway.update", { capability, exposed }));
      const auth = async () => success<{ token: string; id: string }>(await control("gateway.tokens.create", { name: "safe synthetic tool" }));
      const principal = await auth(),
        otherPrincipal = await auth();
      const external = (name: string, input: unknown = {}, key?: string) => request(live, principal.token, name, input, key);
      const externalSession = async () => sessionOf(success<Status>(await external("safe.status")));
      expect((await discovery(http.token)).some((name) => name.startsWith("safe."))).toBe(false);
      expectCode(await httpCall("safe.accounts.reveal"), "CAPABILITY_NOT_EXPOSED");
      expectCode(await request(e, other.token, "safe.items.reveal", { id: legacy.id }), "CAPABILITY_NOT_FOUND");
      expect(success(await desktop("safe.unlock", { password: masterPassword }))).toEqual({ ok: true });
      expect([legacy.metadataPath, legacy.sealedPath].map((file) => readFileSync(file))).toEqual(originalLegacy);
      await allow("safe.status", true);

      expect(success(await control("safe.setup", { password: masterPassword }))).toEqual({ ok: true });
      const desktopSession = sessionOf(success<Status>(await control("safe.status")));
      const name = "Synthetic Safe record";
      const created = success<Created>(
        await control("safe.entries.create", {
          session: desktopSession,
          expectedRevision: 0,
          name,
          accounts: [
            { account: "fixture one", password: secret },
            { account: "fixture two", password: otherSecret },
          ],
        }),
      );
      expect(Object.keys(created).sort()).toEqual(["accountIds", "entryId", "revision", "status"]);
      const { entryId } = created,
        accountId = created.accountIds[0]!;
      await set("safe.status", true);
      await set("safe.entries.get", true);
      const session = await externalSession();
      const subject = { session, entryId, accountId };
      const detail = success<Entry>(await external("safe.entries.get", { session, entryId }));
      expect(detail).toMatchObject({ entryId, name, accounts: created.accountIds.map((id) => ({ accountId: id, hasPassword: true })) });
      expect(detail.accounts.every((account) => !Object.hasOwn(account, "password"))).toBe(true);
      expectCode(await external("safe.accounts.reveal", subject), "CAPABILITY_NOT_EXPOSED");
      expectCode(await external("safe.entries.update", { session, entryId, expectedRevision: detail.revision, name: "HTTP fixture name" }), "CAPABILITY_NOT_EXPOSED");
      expectCode(
        await control("gateway.policy.preview", {
          changes: [
            { capability: "safe.accounts.reveal", exposed: true },
            { capability: "safe.entries.list", exposed: true },
          ],
        }),
        "INVALID_INPUT",
      );
      const policy = success<{ targets: { capability: string; risk: string }[] }>(await control("gateway.policy.preview", { changes: [{ capability: "safe.accounts.reveal", exposed: true }] }));
      expect(policy.targets).toMatchObject([{ capability: "safe.accounts.reveal", risk: "high" }]);
      await set("safe.accounts.reveal", true);
      const key = randomUUID();
      const revealed = success<{ password: string }>(await external("safe.accounts.reveal", subject, key));
      expect(revealed.password === secret).toBe(true);
      expectCode(await request(live, otherPrincipal.token, "safe.accounts.reveal", subject, key), "PERMISSION_DENIED");
      expectCode(await request(live, principal.token, "safe.accounts.reveal", subject, randomUUID(), randomUUID()), "INVALID_INPUT");

      await set("safe.entries.update", true);
      const httpEdit = { session, entryId, expectedRevision: detail.revision, name: "HTTP fixture name" };
      const editKey = randomUUID();
      const afterHttp = success<{ revision: number }>(await external("safe.entries.update", httpEdit, editKey));
      expectCode(await external("safe.entries.update", httpEdit, editKey), "VERSION_CONFLICT");
      await set("safe.entries.update", false);
      expectCode(await external("safe.entries.update", httpEdit, editKey), "CAPABILITY_NOT_EXPOSED");
      await set("safe.entries.update", true);

      const cliSession = sessionOf(success<Status>(await cli(live, "safe.status", {})));
      const afterCli = success<{ revision: number }>(await cli(live, "safe.entries.update", { session: cliSession, entryId, expectedRevision: afterHttp.revision, name: "CLI fixture name" }));
      await set("safe.accounts.update", true);
      const accountSaved = success<{ revision: number; hasPassword: boolean }>(
        await cli(live, "safe.accounts.update", { session: cliSession, entryId, accountId, expectedRevision: afterCli.revision, password: { kind: "set", value: replacement } }),
      );
      expect(accountSaved.hasPassword).toBe(true);
      expect(success<{ password: string }>(await external("safe.accounts.reveal", subject, key)).password === replacement).toBe(true);

      success(await control("gateway.mcp.update", { enabled: true, transport: "http" }));
      const endpoint = `${urlOf(live)}/mcp`;
      const handle = await openMcpSession(endpoint, principal.token);
      const mcp = async (method: string, params?: object): Promise<Rpc> => {
        const response = await mcpRequest(endpoint, principal.token, mcpRpc(method, params), handle);
        if (!response.ok) throw new Error(`Safe MCP HTTP ${response.status}`);
        return (await response.json()) as Rpc;
      };
      const data = <T>(reply: Rpc): T => {
        if (reply.result?.isError || !reply.result?.structuredContent) throw new Error("Safe MCP tool failed");
        return reply.result.structuredContent.data as T;
      };
      expect((await mcp("tools/list")).result?.tools?.some(({ name }) => name === "safe_accounts_reveal")).toBe(true);
      expect((await mcp("tools/call", { name: "safe_accounts_reveal", arguments: subject })).result?.isError).toBe(true);
      const mcpSession = sessionOf(data<Status>(await mcp("tools/call", { name: "safe_status", arguments: {} })));
      const viaMcp = data<{ revision: number }>(await mcp("tools/call", { name: "safe_entries_update", arguments: { session: mcpSession, entryId, expectedRevision: accountSaved.revision, name: "HTTP MCP fixture name" } }));
      expect(data<{ password: string }>(await mcp("tools/call", { name: "safe_accounts_reveal", arguments: { ...subject, session: mcpSession } })).password === replacement).toBe(true);

      success(await control("gateway.mcp.update", { enabled: true, transport: "stdio" }));
      await withStdio(live, async (send) => {
        expect((await send("tools/list")).result?.tools?.some(({ name }) => name === "safe_entries_update")).toBe(true);
        const stdioSession = sessionOf(data<Status>(await send("tools/call", { name: "safe_status", arguments: {} })));
        const saved = data<{ revision: number }>(await send("tools/call", { name: "safe_entries_update", arguments: { session: stdioSession, entryId, expectedRevision: viaMcp.revision, name: "stdio MCP fixture name" } }));
        expect(saved.revision).toBe(viaMcp.revision + 1);
        const args = { session: stdioSession, entryId, accountId };
        expect(data<{ password: string }>(await send("tools/call", { name: "safe_accounts_reveal", arguments: args })).password === replacement).toBe(true);
        await set("safe.accounts.reveal", false);
        const denied = await send("tools/call", { name: "safe_accounts_reveal", arguments: args });
        expect(denied.result?.isError).toBe(true);
        expect(JSON.stringify(denied).includes(replacement)).toBe(false);
        expectCode(await external("safe.accounts.reveal", subject, key), "CAPABILITY_NOT_EXPOSED");
        expect(success<Entry>(await external("safe.entries.get", { session, entryId })).name).toBe("stdio MCP fixture name");
      });

      await set("safe.accounts.reveal", true);
      await set("safe.unlock", true);
      success(await control("safe.lock"));
      expectCode(await external("safe.accounts.reveal", subject, key), "SAFE_LOCKED");
      const unlockInput = { session: await externalSession(), password: masterPassword };
      expect(success(await cli(live, "safe.unlock", { ...unlockInput, session: sessionOf(success<Status>(await cli(live, "safe.status", {}))) }))).toEqual({ ok: true });
      expectCode(await external("safe.unlock", unlockInput, key), "SAFE_LOCKED");
      const rebound = await externalSession();
      expect(success<{ password: string }>(await external("safe.accounts.reveal", { ...subject, session: rebound }, key)).password === replacement).toBe(true);
      await allow("safe.accounts.reveal", true);
      expectCode(await httpCall("safe.accounts.reveal", { ...subject, session: rebound }, key), "SAFE_LOCKED");
      const log = path.join(live.vault.runtimeDir, "idempotency.ndjson");
      expect(existsSync(log) && /safe\.(entries|accounts|unlock)/.test(readFileSync(log, "utf8"))).toBe(false);
      expect(containsPrivateBytes(live.vault.root, [masterPassword, secret, otherSecret, replacement, session.callerProof!])).toBe(false);
    });
  },
  60_000,
);

engineTest(
  "真实授权撤销挡住暂存写入及迟到明文，锁定后同键复查当前会话",
  async () => {
    await fixture(async (open) => {
      const e = await open();
      const desktop = (name: string, input: unknown = {}) => request(e, e.rendererToken, name, input);
      const allow = async (name: string, exposed: boolean) => success(await desktop("gateway.update", { capability: name, exposed }));
      const master = randomUUID(),
        marker = randomUUID();
      success(await desktop("safe.setup", { password: master }));
      const own = sessionOf(success<Status>(await desktop("safe.status")));
      const made = success<Created>(await desktop("safe.entries.create", { session: own, expectedRevision: 0, name: "Revocation fixture", accounts: [{ account: "fixture", password: marker }] }));
      for (const name of ["safe.status", "safe.entries.update", "safe.accounts.reveal"]) await allow(name, true);
      const { token } = success<{ token: string }>(await desktop("gateway.tokens.create", { name: "revocation fixture" }));
      const outside = (name: string, input: unknown = {}, key?: string) => request(e, token, name, input, key);
      const session = sessionOf(success<Status>(await outside("safe.status")));
      const entry = { session, entryId: made.entryId };
      const old = readFileSync(path.join(e.vault.root, ".huhu", "safe", "current", "manifest.json"));

      const writing = signal(),
        releaseWrite = signal();
      const write = e.vault.files.write.bind(e.vault.files);
      const delayedWrite = vi.spyOn(e.vault.files, "write").mockImplementation(async (...args) => {
        if (args[0].endsWith("/entry.bin")) {
          writing.resolve();
          await releaseWrite.promise;
        }
        return write(...args);
      });
      const key = randomUUID();
      const edit = { ...entry, expectedRevision: made.revision, name: "Denied staged edit" };
      const writer = outside("safe.entries.update", edit, key);
      try {
        await started(writing.promise, writer);
        await allow("safe.entries.update", false);
      } finally {
        releaseWrite.resolve();
      }
      const denied = await writer;
      delayedWrite.mockRestore();
      expectCode(denied, "CAPABILITY_NOT_EXPOSED");
      expect(readFileSync(path.join(e.vault.root, ".huhu", "safe", "current", "manifest.json")).equals(old)).toBe(true);
      expectCode(await outside("safe.entries.update", edit, key), "CAPABILITY_NOT_EXPOSED");

      const original = Safe.prototype.revealAccount;
      const reveal = (key: string) => outside("safe.accounts.reveal", { ...entry, accountId: made.accountIds[0]! }, key);
      async function interruptRead(interrupt: () => Promise<unknown>, expected: string) {
        const ready = signal(),
          release = signal();
        const blocked = vi.spyOn(Safe.prototype, "revealAccount").mockImplementationOnce(async function (this: Safe, ...args) {
          const result = await original.apply(this, args);
          ready.resolve();
          await release.promise;
          return result;
        });
        const readKey = randomUUID();
        const reading = reveal(readKey);
        try {
          await started(ready.promise, reading);
          await interrupt();
        } finally {
          release.resolve();
        }
        const reply = await reading;
        blocked.mockRestore();
        expectCode(reply, expected);
        expect(JSON.stringify(reply).includes(marker)).toBe(false);
        expectCode(await reveal(readKey), expected);
      }
      await interruptRead(() => allow("safe.accounts.reveal", false), "CAPABILITY_NOT_EXPOSED");
      await allow("safe.accounts.reveal", true);

      async function readDuringRevocation(read: () => Promise<Response>, revoke: () => Promise<unknown>) {
        const ready = signal();
        const release = signal();
        const blocked = vi.spyOn(Safe.prototype, "revealAccount").mockImplementationOnce(async function (this: Safe, ...args) {
          const result = await original.apply(this, args);
          ready.resolve();
          await release.promise;
          return result;
        });
        const reading = read();
        try {
          await started(ready.promise, reading);
          await revoke();
        } finally {
          release.resolve();
          blocked.mockRestore();
        }
        return reading;
      }

      const revokable = success<{ id: string; token: string }>(await desktop("gateway.tokens.create", { name: "second bearer" }));
      const revokableSession = sessionOf(success<Status>(await request(e, revokable.token, "safe.status")));
      const account = { ...entry, accountId: made.accountIds[0]! };
      const bearer = await readDuringRevocation(
        () => requestResponse(e, revokable.token, "safe.accounts.reveal", { ...account, session: revokableSession }),
        () => desktop("gateway.tokens.revoke", { id: revokable.id }),
      );
      expect(bearer.status).toBe(401);
      expect(bearer.headers.get("cache-control")).toBe("no-store");
      expect((await bearer.text()).includes(marker)).toBe(false);

      success(await desktop("gateway.mcp.update", { enabled: true, transport: "http" }));
      const endpoint = `${urlOf(e)}/mcp`;
      const handle = await openMcpSession(endpoint, token);
      const status = await mcpRequest(endpoint, token, mcpRpc("tools/call", { name: "safe_status", arguments: {} }), handle);
      const statusRpc = (await status.json()) as Rpc;
      const mcpSession = sessionOf(statusRpc.result?.structuredContent?.data as Status);
      const mcp = await readDuringRevocation(
        () => mcpRequest(endpoint, token, mcpRpc("tools/call", { name: "safe_accounts_reveal", arguments: { ...account, session: mcpSession } }), handle),
        () => desktop("gateway.mcp.update", { enabled: false, transport: "http" }),
      );
      expect(mcp.status).toBe(401);
      expect(mcp.headers.get("cache-control")).toBe("no-store");
      const body = await mcp.text();
      expect(JSON.parse(body)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(body.includes(marker)).toBe(false);
      expect(success<{ password: string }>(await reveal(randomUUID())).password === marker).toBe(true);

      await interruptRead(() => desktop("safe.lock"), "SAFE_LOCKED");
      await allow("safe.entries.update", true);
      expectCode(await outside("safe.entries.update", edit, key), "SAFE_LOCKED");
      const records = success<{ subject: string; action: string }[]>(await desktop("safe.audit.list"));
      expect(records.some(({ subject, action }) => subject === "http" && action === "reveal-account")).toBe(true);
      expect(containsPrivateBytes(e.vault.root, [master, marker, session.callerProof!])).toBe(false);
    });
  },
  35_000,
);

engineTest(
  "同源已登录 Web 使用同一条目和会话代，邀请撤销丢弃在途读取",
  async () => {
    await fixture(async (open, temp) => {
      const assets = path.join(temp, "web");
      mkdirSync(assets);
      writeFileSync(path.join(assets, "index.html"), "<!doctype html><title>Safe synthetic fixture</title>");
      const e = await open({ webAssetsDir: assets });
      const desktop = (name: string, input: unknown = {}) => request(e, e.rendererToken, name, input);
      const origin = success<{ addresses: { url: string }[] }>(await desktop("web.share.start", { mode: "local" })).addresses[0]!.url;
      const invitation = success<{ id: string; links: string[] }>(await desktop("web.invitations.create"));
      const invite = new URLSearchParams(new URL(invitation.links[0]!).hash.slice(1)).get("invite");
      if (!invite) throw new Error("Missing synthetic web invitation");
      const join = await fetch(`${origin}/api/v1/session`, { method: "POST", headers: { origin, authorization: `Bearer ${invite}` } });
      expect(join.status).toBe(204);
      const cookie = join.headers.get("set-cookie")?.split(";")[0];
      if (!cookie) throw new Error("Missing synthetic web session cookie");
      const web = (capability: string, input: unknown = {}) =>
        fetch(`${origin}/api/v1/call`, {
          method: "POST",
          headers: { origin, cookie, "content-type": "application/json" },
          body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
        });
      const call = async (capability: string, input?: unknown) => CapabilityResultSchema.parse(await (await web(capability, input)).json());
      const master = randomUUID(),
        secret = randomUUID();
      const fresh = sessionOf(success<Status>(await call("safe.status")));
      expect(success(await call("safe.setup", { session: fresh, password: master }))).toEqual({ ok: true });
      const session = sessionOf(success<Status>(await call("safe.status")));
      const made = success<Created>(await call("safe.entries.create", { session, expectedRevision: 0, name: "Web fixture", accounts: [{ account: "fixture", password: secret }] }));
      const subject = { session, entryId: made.entryId, accountId: made.accountIds[0]! };
      expect(success<Entry>(await desktop("safe.entries.get", { session, entryId: made.entryId })).name).toBe("Web fixture");
      expect(success<{ password: string }>(await call("safe.accounts.reveal", subject)).password === secret).toBe(true);
      const ready = signal(),
        release = signal();
      const original = Safe.prototype.revealAccount;
      vi.spyOn(Safe.prototype, "revealAccount").mockImplementationOnce(async function (this: Safe, ...args) {
        const data = await original.apply(this, args);
        ready.resolve();
        await release.promise;
        return data;
      });
      const reading = web("safe.accounts.reveal", subject);
      try {
        await started(ready.promise, reading);
        expect(success(await desktop("web.invitations.revoke", { id: invitation.id }))).toMatchObject({ revoked: true });
      } finally {
        release.resolve();
      }
      const result = await (await reading).text();
      expect(result.includes(secret)).toBe(false);
      expect((await web("safe.accounts.reveal", subject)).status).toBe(401);
      expect(success<{ password: string }>(await desktop("safe.accounts.reveal", subject)).password === secret).toBe(true);
    });
  },
  30_000,
);
