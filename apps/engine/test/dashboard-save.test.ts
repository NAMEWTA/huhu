import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { DashboardBoardSchema, DashboardViewSchema, type DashboardUpdate } from "@huhu/contracts";
import { expect, test } from "vitest";
import { boot, type RunningEngine } from "../src/boot.js";

function call(port: number, token: string, capability: string, input: unknown, key: string = randomUUID()): Promise<{ ok: boolean; data?: unknown; error?: { code: string } }> {
  const body = JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: key });
  return new Promise((resolve, reject) => {
    const req = request(`http://127.0.0.1:${port}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, (response) => {
      response.setEncoding("utf8");
      let text = "";
      response.on("data", (chunk) => (text += chunk));
      response.on("error", reject);
      response.on("end", () => {
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

test("W02-03/04 断开前后的整板重读、原意图回放和已提交备份", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-dashboard-transport-"));
  let engine: RunningEngine | undefined;
  let proxy: Server | undefined;
  try {
    const e = await boot({ vaultPath: root, create: true });
    engine = e;
    const widgetType = "widget:tasks:tasks";
    const get = async () => DashboardViewSchema.parse((await call(e.port, e.rendererToken, "home.dashboard.get", {})).data);
    const backup = () => call(e.port, e.rendererToken, "home.dashboard.backup", {});
    const update = (draft: DashboardUpdate, key: string, port = e.port) => call(port, e.rendererToken, "home.dashboard.update", draft, key);
    const base = (await get()).board;
    expect(await backup()).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

    let forward = false;
    proxy = createServer((incoming, response) => {
      if (!forward) {
        response.destroy();
        return;
      }
      const upstream = request(`http://127.0.0.1:${e.port}${incoming.url}`, { method: incoming.method, headers: { ...incoming.headers, host: `127.0.0.1:${e.port}` } }, (ack) => {
        ack.resume();
        ack.on("end", () => response.destroy());
        ack.on("error", (error) => response.destroy(error));
      });
      upstream.on("error", (error) => response.destroy(error));
      incoming.pipe(upstream);
    });
    await new Promise<void>((resolve, reject) => proxy!.once("error", reject).listen(0, "127.0.0.1", resolve));
    const relay = (proxy.address() as AddressInfo).port;
    const first: DashboardUpdate = {
      baseRevision: base.revision,
      instances: [...base.instances, { instanceId: "second", widgetType, config: {}, hidden: true }],
      layout: [...base.layout, { instanceId: "second", x: 3, y: 5, w: 3, h: 2 }],
    };
    const key = randomUUID();
    await expect(update(first, key, relay)).rejects.toMatchObject({ code: "ECONNRESET" });
    expect((await get()).board).toEqual(base);

    forward = true;
    await expect(update(first, key, relay)).rejects.toMatchObject({ code: "ECONNRESET" });
    const saved = await get();
    expect(saved.board.revision).not.toBe(base.revision);
    expect(saved.board).toMatchObject({ instances: first.instances, layout: first.layout });
    expect(await update(first, key)).toEqual({ ok: true, data: saved });

    const file = e.vault.files.abs(".huhu/home/widgets.json");
    const bytes = readFileSync(file);
    const other: DashboardUpdate = { ...first, baseRevision: saved.board.revision, layout: first.layout.map(({ y, ...item }) => ({ ...item, y: y + 1 })) };
    expect(DashboardBoardSchema.parse((await backup()).data)).toEqual(saved.board);
    expect(readFileSync(file)).toEqual(bytes);
    expect(await update(other, randomUUID())).toMatchObject({ ok: true });
    const current = await get();
    expect(current.board.revision).not.toBe(saved.board.revision);
    expect(current.board.layout).toEqual(other.layout);
    expect(await update(first, randomUUID())).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await get()).toEqual(current);

    writeFileSync(file, "{broken");
    expect(await backup()).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(readFileSync(file, "utf8")).toBe("{broken");
  } finally {
    if (proxy) await new Promise<void>((resolve) => proxy!.close(() => resolve()));
    await engine?.shutdown();
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
