import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { HerdrClient, attachTerminal } from "../src/index.js";

const BIN = process.env["HUHU_HERDR_BIN"] ?? path.resolve(import.meta.dirname, "../../..", "apps/desktop/resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core")
const dir = mkdtempSync(path.join(tmpdir(), "huhu-hl-"));
const env = { ...process.env, HC_SESSION: "huhulive", HC_SOCKET: path.join(dir, "hc.sock"), XDG_STATE_HOME: path.join(dir, "state"), XDG_CONFIG_HOME: path.join(dir, "config") };

afterAll(() => {
  if (existsSync(BIN)) spawnSync(BIN, ["server", "stop"], { env });
  rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!existsSync(BIN))("真实 Herdr Core：attach 终端", () => {
  test("输入回显、resize、程序退出时收到 CLOSE(exited)", async () => {
    spawnSync(BIN, ["server", "start"], { env });
    const c = new HerdrClient({ endpoint: env.HC_SOCKET });
    await c.connect();
    const run = await c.call<{ address: string }>("terminal.run", { argv: ["/bin/sh"], cwd: "/tmp", name: "attach-test" });
    const t = await attachTerminal(env.HC_SOCKET, { terminal: run.address, cols: 100, rows: 30 });
    let out = "";
    const closed = new Promise<{ reason?: string; exit_code?: number | null } | null>((r) => t.onClose(r));
    t.onData((b) => { out += b.toString("utf8"); });
    t.write(Buffer.from("echo HUHU-ATTACH-$((20+22))\n"));
    for (let i = 0; i < 100 && !out.includes("HUHU-ATTACH-42"); i++) await new Promise((r) => setTimeout(r, 50));
    expect(out).toContain("HUHU-ATTACH-42");
    t.resize(120, 40);
    t.write(Buffer.from("stty size\n"));
    for (let i = 0; i < 100 && !/40 120/.test(out); i++) await new Promise((r) => setTimeout(r, 50));
    expect(out).toMatch(/40 120/);
    t.write(Buffer.from("exit 7\n"));
    const reason = await Promise.race([closed, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 5000))]);
    expect(reason).toMatchObject({ reason: "exited", exit_code: 7 });
    c.close();
  }, 30_000);
});
