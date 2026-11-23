import { expect, test, type JSHandle } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readlink, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { UtilityProcess } from "electron";
import type { CapabilityResult } from "../../../packages/contracts/src/index.js";
import { fixtureProcessRunning } from "../../../plugins/agent-cli/test/fixtures/core-cli.js";
import { withFixtureCleanup, withFixtureDeadline, type openCandidateDesktop } from "./candidate-desktop.js";

type Candidate = Pick<Awaited<ReturnType<typeof openCandidateDesktop>>, "app" | "resources" | "confirmEngine">;
type Ready = { type: "ready"; port: number; rendererToken: string; vaultId: string };
type UtilityState = { child: UtilityProcess; pid: number | undefined; ready?: Ready; exitCode?: number };

export async function verifyCandidateMissingWebEntry({ app, resources, confirmEngine }: Candidate) {
  const desktopEngine = await confirmEngine();
  const root = await mkdtemp("/tmp/hc-wa-");
  const assets = path.join(root, "renderer");
  const vault = path.join(root, "vault");
  const index = path.join(assets, "index.html");
  const held = path.join(root, "index.html.held");
  const archive = path.join(resources, "app.asar");
  const relativeEntry = "out/main/engine.js";
  const relativeIndex = "out/renderer/index.html";
  const entry = path.join(archive, relativeEntry);
  const source = path.join(archive, relativeIndex);
  const env = {
    PATH: "/usr/bin:/bin",
    HOME: path.join(root, "home"),
    XDG_RUNTIME_DIR: path.join(root, "runtime"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_STATE_HOME: path.join(root, "state"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    HUHU_WEB_ASSETS_DIR: assets,
  };
  let utility: JSHandle<UtilityState> | undefined;
  let childExited = false;

  await withFixtureCleanup(async () => {
    for (const dir of [assets, vault, env.HOME, env.XDG_RUNTIME_DIR, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_STATE_HOME, env.XDG_CACHE_HOME]) await mkdir(dir, { mode: 0o700 });
    utility = await app.evaluateHandle(
      ({ app: electronApp, utilityProcess }, { archive, source, index, entry, vault, env }): UtilityState => {
        if (electronApp.getAppPath() !== archive) throw new Error("当前桌面未使用已校验的候选 ASAR");
        const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
        fs.writeFileSync(index, fs.readFileSync(source), { mode: 0o600, flag: "wx" });
        const child = utilityProcess.fork(entry, ["--vault", vault, "--create"], { cwd: vault, env, stdio: "ignore", serviceName: "huhu-web-assets-fixture" });
        const state: UtilityState = { child, pid: child.pid };
        child.once("spawn", () => {
          state.pid = child.pid;
        });
        child.once("exit", (code) => {
          state.exitCode = code;
        });
        child.on("message", (message: Ready) => {
          if (
            message?.type === "ready" &&
            typeof message.rendererToken === "string" &&
            message.rendererToken &&
            Number.isSafeInteger(message.port) &&
            message.port > 0 &&
            message.port <= 65_535 &&
            /^vault-[a-z0-9]{8,}$/u.test(message.vaultId)
          )
            state.ready = message;
        });
        return state;
      },
      { archive, source, index, entry, vault, env },
    );
    const identity = () =>
      utility!.evaluate(({ pid, ready, exitCode }) => {
        if (exitCode !== undefined) throw new Error(`隔离 Engine 提前退出 (${exitCode})`);
        return { pid, vaultId: ready?.vaultId, port: ready?.port };
      });
    await expect.poll(identity, { timeout: 25_000 }).toMatchObject({ pid: expect.any(Number), vaultId: expect.any(String), port: expect.any(Number) });
    const { pid, vaultId, port } = await identity();
    if (!pid || !vaultId || !port) throw new Error("隔离 Engine 缺少就绪身份");
    expect(pid).not.toBe(desktopEngine.pid);
    expect(vaultId).not.toBe(desktopEngine.vaultId);
    expect(await readlink(`/proc/${pid}/exe`)).toBe(desktopEngine.executablePath);

    const origin = await utility.evaluate(async ({ ready }) => {
      if (!ready) throw new Error("隔离 Engine 未就绪");
      const response = await fetch(`http://127.0.0.1:${ready.port}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${ready.rendererToken}`, "content-type": "application/json" },
        body: JSON.stringify({ capability: "web.share.start", input: { mode: "local", port: 0 }, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = (await response.json()) as CapabilityResult<{ state: string; reason?: string; addresses?: { url: string }[] }>;
      if (!response.ok || !result.ok) throw new Error(`隔离 Engine 启动 Web 分享失败 (${response.status})`);
      const [address] = result.data.addresses ?? [];
      if (result.data.state !== "running" || !address || !/^http:\/\/127\.0\.0\.1:\d+$/u.test(address.url)) throw new Error(`隔离 Engine 未开启回环分享 (${result.data.reason ?? result.data.state})`);
      return address.url;
    });
    expect(origin).not.toBe(`http://127.0.0.1:${port}`);
    const readRoute = () => fetch(`${origin}/notes/fixture.md`, { redirect: "error", signal: AbortSignal.timeout(8_000) });
    const expectedIndex = await readFile(index);
    expect(expectedIndex.length).toBeGreaterThan(0);
    const expectIndex = async () => {
      const response = await readRoute();
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()).equals(expectedIndex)).toBe(true);
    };
    await expectIndex();
    await rename(index, held);
    try {
      const missing = await readRoute();
      expect(missing.status).toBe(503);
      expect(await missing.text()).toBe("Web 工作台构建资源不可用");
    } finally {
      await rename(held, index);
    }
    await expectIndex();
    expect(await identity()).toEqual({ pid, port, vaultId });
    await test.info().attach("gateway-web-assets-fixture", {
      contentType: "application/json",
      body: JSON.stringify({ archive, engineEntry: relativeEntry, indexSource: relativeIndex, assetRoot: assets, indexSha256: createHash("sha256").update(expectedIndex).digest("hex"), pid, vaultId, origin, statuses: [200, 503, 200] }),
    });
  }, [
    [
      "关闭隔离 Engine 并核对 PID 退出",
      async () => {
        if (!utility) return;
        const stopped = await withFixtureDeadline(28_000, () =>
          utility!.evaluate(async (state) => {
            const { child } = state;
            const waitForExit = (timeout: number) =>
              new Promise<boolean>((resolve) => {
                if (state.exitCode !== undefined) {
                  resolve(true);
                  return;
                }
                const exited = () => {
                  clearTimeout(timer);
                  resolve(true);
                };
                const timer = setTimeout(() => {
                  child.off("exit", exited);
                  resolve(false);
                }, timeout);
                child.once("exit", exited);
              });
            if (state.exitCode === undefined) {
              try {
                child.postMessage({ type: "shutdown" });
              } catch {
                /* already exiting */
              }
              if (!(await waitForExit(16_000))) {
                child.kill();
                if (!(await waitForExit(4_000))) {
                  const pid = child.pid;
                  if (pid && pid === state.pid && state.exitCode === undefined) {
                    try {
                      process.kill(pid, "SIGKILL");
                    } catch (error) {
                      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
                    }
                  }
                  if (!(await waitForExit(4_000))) throw new Error("隔离 Engine 未退出");
                }
              }
            }
            return { pid: state.pid, exitCode: state.exitCode };
          }),
        );
        const { pid, exitCode } = stopped;
        if (pid) await expect.poll(() => fixtureProcessRunning(pid), { timeout: 5_000 }).toBe(false);
        childExited = true;
        await test.info().attach("gateway-web-assets-fixture-exit", { contentType: "application/json", body: JSON.stringify({ pid, exitCode }) });
        expect(exitCode).toBe(0);
      },
    ],
    ["释放隔离 Engine 句柄", () => utility?.dispose()],
    [
      "删除隔离资源目录",
      async () => {
        if (!utility || childExited) await rm(root, { recursive: true, force: true });
      },
    ],
  ]);
}
