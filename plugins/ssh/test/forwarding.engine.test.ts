import { mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import { FORWARD_BIND, type ForwardRule, type SaveForward } from "../src/shared/forwarding.js";

async function api(vaultPath: string, desktopUserData: string, create: boolean) {
  const engine = await boot({ vaultPath, desktopUserData, create });
  const client = new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  return { engine, client };
}

async function bind(server: net.Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, FORWARD_BIND, () => {
      server.removeListener("error", reject);
      resolve((server.address() as net.AddressInfo).port);
    });
  });
}

const close = (server: net.Server) => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
const save = (client: EngineClient, draft: SaveForward) => client.call<ForwardRule>("ssh.forwarding.rules.save", draft, { write: true });

test("four forwarding configurations persist by revision without opening a socket", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-forward-config-"));
  const vault = path.join(root, "vault");
  const userData = path.join(root, "data");
  let engine: RunningEngine | undefined;
  try {
    await Promise.all([mkdir(vault), mkdir(userData)]);
    const live = await api(vault, userData, true);
    engine = live.engine;
    const host = await live.client.call<{ id: string }>("ssh.hosts.save", { name: "fixture", host: FORWARD_BIND, user: "fixture", auth: { kind: "agent" } }, { write: true });
    const probe = net.createServer();
    const listenPort = await bind(probe);
    await close(probe);
    const shared = { hostId: host.id, listenPort, resume: true };
    const target = { host: FORWARD_BIND, port: 1234 };
    const drafts: SaveForward[] = [
      { ...shared, name: "Local", mode: "local", target },
      { ...shared, name: "Remote", mode: "remote", target },
      { ...shared, name: "SOCKS5", mode: "socks5" },
      { ...shared, name: "HTTP CONNECT", mode: "http-connect" },
    ];
    const rules = [];
    for (const draft of drafts) rules.push(await save(live.client, draft));
    expect(await bind(probe, listenPort)).toBe(listenPort);
    await close(probe);
    const [local] = rules;
    const previous = { id: local!.id, expectedRevision: local!.revision };
    const modified = await save(live.client, { ...shared, name: "Local edited", mode: "local", target, previous });
    expect(modified).toMatchObject({ id: local!.id, boundTarget: local!.boundTarget, name: "Local edited" });
    expect(modified.revision).not.toBe(local!.revision);
    await expect(save(live.client, { ...shared, mode: "local", name: "stale", target, previous })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    for (const invalid of [
      { ...drafts[0], listenPort: 65536 },
      { ...drafts[0], listenHost: "0.0.0.0" },
      { ...drafts[1], relay: "shell" },
      { ...drafts[2], target },
      { ...drafts[3], relay: "shell" },
    ]) {
      await expect(live.client.call("ssh.forwarding.rules.save", invalid, { write: true })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    await expect(live.client.call("ssh.hosts.delete", { id: host.id }, { write: true })).rejects.toThrow(/转发规则引用/);
    const cli = new EngineClient({ ...live.client.endpoint, token: engine.cliToken });
    await expect(cli.call("ssh.forwarding.rules.list")).rejects.toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
    expect(await engine.dispatcher.call("web:synthetic", { capability: "ssh.forwarding.rules.list", requestId: "forwarding-test", input: {} })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await engine.shutdown();
    const reopened = await api(vault, userData, false);
    engine = reopened.engine;
    expect(await reopened.client.call<ForwardRule[]>("ssh.forwarding.rules.list")).toEqual(expect.arrayContaining([modified, ...rules.slice(1)]));
    expect(await bind(probe, listenPort)).toBe(listenPort);
    await close(probe);
    await reopened.client.call("ssh.forwarding.rules.delete", { id: modified.id, expectedRevision: modified.revision }, { write: true });
    expect(await reopened.client.call<ForwardRule[]>("ssh.forwarding.rules.list")).toHaveLength(3);
  } finally {
    await engine?.shutdown();
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
