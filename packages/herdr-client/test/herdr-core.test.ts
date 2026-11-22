import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { HerdrCore } from "../src/herdr-core.js";

async function privateCoreFixture(run: (core: HerdrCore, server: Server) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-core-stop-"));
  vi.stubEnv("XDG_RUNTIME_DIR", root);
  const core = new HerdrCore({ bin: path.join(root, "no-executable"), vaultId: "vault-fixture", machineId: "test", runtimeDir: path.join(root, "state"), socketName: "huhu-ssh-fixture" });
  const server = createServer();
  try {
    mkdirSync(path.dirname(core.endpoint), { mode: 0o700 });
    await run(core, server);
  } finally {
    core.dispose();
    try {
      if (server.listening) {
        const closed = once(server, "close");
        server.close();
        await closed;
      }
    } finally {
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  }
}

test.skipIf(process.platform === "win32")("私有 Core 关闭使用当前 Core 的 RPC 回执，不依赖再次启动可执行文件", async () => {
  await privateCoreFixture(async (core, server) => {
    const methods: string[] = [];
    server.on("connection", (wire) => {
      wire.once("data", (buffer) => {
        const { id, method } = JSON.parse(buffer.toString("utf8")) as { id: number; method: string };
        methods.push(method);
        wire.end(JSON.stringify({ jsonrpc: "2.0", id, result: { stopped: true } }) + "\n");
        server.close();
      });
    });
    server.listen(core.endpoint);
    await once(server, "listening");
    await expect(Promise.all([core.stop({ requireConfirmation: true }), core.stop({ requireConfirmation: true })])).resolves.toEqual([undefined, undefined]);
    expect(methods).toEqual(["server.stop"]);
    expect(server.listening).toBe(false);
  });
});

test.skipIf(process.platform === "win32")("只有私有 holder 可达时，Core 关闭结果仍未知", async () => {
  await privateCoreFixture(async (core, server) => {
    server.listen(core.endpoint.replace(/\.sock$/u, ".holder.1234abcd.sock"));
    await once(server, "listening");
    await expect(core.stop({ requireConfirmation: true })).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE", details: { outcome: "unknown" } });
    expect(server.listening).toBe(true);
  });
});
