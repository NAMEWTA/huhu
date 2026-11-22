import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { HerdrClient } from "../../../packages/herdr-client/src/client.js";
import { endpointRootBinding } from "../../../packages/vault/src/identity.js";
import { machineId } from "../../../packages/vault/src/vault.js";
import { AGENT_CATALOG } from "../../../plugins/agent-cli/src/shared/catalog.js";
import { emptyAgentSettings } from "../../../plugins/agent-cli/src/shared/settings.js";
import { fixtureProcessRunning } from "../../../plugins/agent-cli/test/fixtures/core-cli.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";
import { candidateEnvironment, candidatePackage, confirmCandidate } from "./candidate-package.js";

type CleanupStep = readonly [label: string, run: () => unknown];

export async function withFixtureDeadline<T>(timeout: number, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`夹具操作超过 ${timeout} ms`)), timeout);
  });
  try {
    return await Promise.race([run(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function withFixtureCleanup<T>(body: () => Promise<T>, steps: readonly CleanupStep[]): Promise<T> {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: await body() };
  } catch (error) {
    outcome = { ok: false, error };
  }

  const failures: { stage: string; code?: string }[] = [];
  for (const [label, run] of steps) {
    try {
      await run();
    } catch (error) {
      // Report only known errno values from errors that may contain fixture data.
      const code = (error as NodeJS.ErrnoException | null)?.code;
      failures.push({ stage: label, ...((code === "ENOENT" || code === "EACCES" || code === "EPERM" || code === "EBUSY") && { code }) });
    }
  }
  if (failures.length) {
    try {
      await withFixtureDeadline(2_000, () => test.info().attach("fixture-cleanup-errors", { body: JSON.stringify(failures), contentType: "application/json" }));
    } catch {
      failures.push({ stage: "写入清理附件" });
    }
  }
  if (!outcome.ok) throw outcome.error;
  if (failures.length) throw new Error(`夹具清理失败：${failures.map(({ stage }) => stage).join("、")}`);
  return outcome.value;
}

async function withCoreSocket<T>(endpoint: string, work: (client: HerdrClient, deadline: AbortSignal) => Promise<T>): Promise<T> {
  const socket = lstatSync(endpoint);
  if (!socket.isSocket() || socket.uid !== process.getuid?.()) throw new Error("Core socket 不属于本夹具用户");
  const client = new HerdrClient({ endpoint });
  const deadline = AbortSignal.timeout(8_000);
  try {
    await client.connect(deadline);
    return await work(client, deadline);
  } finally {
    client.close();
  }
}

function processExecutable(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("无效的进程 PID");
  return readlinkSync(`/proc/${pid}/exe`);
}

async function readCoreIdentity(client: HerdrClient, endpoint: string, executable: string, deadline: AbortSignal) {
  const status = await client.call<{ pid: number; core: { id: string }; holders: { pid: number }[] }>("server.status", {}, deadline);
  const executablePath = processExecutable(status.pid);
  expect(executablePath).toBe(executable);
  if (typeof status.core?.id !== "string" || !status.core.id || !Array.isArray(status.holders)) throw new Error("Core 实例或 holder 证据缺失");
  const holderPids = status.holders.map(({ pid }) => pid);
  if (holderPids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)) throw new Error("无效的 holder PID");
  return { pid: status.pid, coreIdHash: createHash("sha256").update(status.core.id).digest("hex"), endpoint, executablePath, holderPids };
}

export async function openCandidateDesktop(options: { identityAttachment: string; vault?: string; prepareVault?: (vault: string) => void; disableProviderDetection?: boolean }) {
  // Keep this path short for Unix holder sockets and outside the wrapper's exit trap.
  const directory = mkdtempSync(path.join("/tmp", "hc-d-"));
  const vault = options.vault ?? path.join(directory, "vault");
  const runtime = path.join(directory, "runtime");
  const userData = path.join(directory, "desktop");
  const machine = machineId();
  const descriptor = path.join(vault, ".huhu", "runtime", machine, "engine.json");
  const env: Record<string, string> = {
    ...candidateEnvironment(),
    HOME: path.join(directory, "home"),
    XDG_RUNTIME_DIR: runtime,
    XDG_CONFIG_HOME: path.join(directory, "config"),
    XDG_DATA_HOME: path.join(directory, "data"),
    XDG_STATE_HOME: path.join(directory, "state"),
    XDG_CACHE_HOME: path.join(directory, "cache"),
    HUHU_VAULT: vault,
  };
  let app: ElectronApplication | undefined;
  let desktopPid: number | undefined;
  let candidate: Awaited<ReturnType<typeof candidatePackage>> | undefined;
  let engine: Awaited<ReturnType<typeof readEngine>> | undefined;
  let core: Awaited<ReturnType<typeof readCoreIdentity>> | undefined;
  const corePids = new Set<number>();
  let stopped: boolean | undefined;
  let opened = false;

  async function readEngine() {
    if (!app || !desktopPid || !candidate) throw new Error("未取得候选桌面进程");
    let data: { pid: number; port: number; vaultId: string; rootBinding: string; startedAt: string };
    try {
      data = JSON.parse(readFileSync(descriptor, "utf8"));
    } catch {
      throw new Error("无法读取本 Vault 的 Engine 描述");
    }
    const { pid, port, vaultId, rootBinding, startedAt } = data;
    if (rootBinding !== endpointRootBinding(vault) || !/^vault-[a-z0-9]{8,}$/u.test(vaultId) || !Number.isSafeInteger(port) || port < 1 || port > 65_535 || typeof startedAt !== "string") throw new Error("Engine 描述与本 Vault 不符");
    const executablePath = processExecutable(pid);
    expect(executablePath).toBe(candidate.executablePath);
    // Chromium can rewrite its original argv/environment memory; procfs is not a runtime environment API.
    const owner = await withFixtureDeadline(5_000, () =>
      app!.evaluate(
        ({ app }, enginePid) => ({
          pid: process.pid,
          userData: app.getPath("userData"),
          runtime: process.env["XDG_RUNTIME_DIR"],
          processes: app
            .getAppMetrics()
            .filter(({ pid }) => pid === enginePid)
            .map(({ pid, type, name, creationTime }) => ({ pid, type, name, creationTime })),
        }),
        pid,
      ),
    );
    expect(owner.pid).toBe(desktopPid);
    expect(owner.userData).toBe(userData);
    expect(owner.runtime).toBe(runtime);
    expect(pid).not.toBe(desktopPid);
    expect(owner.processes).toHaveLength(1);
    const owned = owner.processes[0]!;
    expect(owned).toMatchObject({ pid, type: "Utility", name: "huhu-engine" });
    expect(Number.isFinite(owned.creationTime) && owned.creationTime > 0).toBe(true);
    const startHash = createHash("sha256").update(startedAt).digest("hex");
    return { pid, desktopPid, creationTime: owned.creationTime, startHash, endpoint: `http://127.0.0.1:${port}`, vaultId, executablePath, descriptor };
  }

  const coreEndpoint = () => engine && path.join(runtime, `huhu-${engine.vaultId.slice(6, 14)}-${machine.slice(0, 4)}.sock`);
  const coreSockets = () =>
    lstatSync(runtime, { throwIfNoEntry: false })
      ? readdirSync(runtime)
          .filter((name) => /^huhu-[a-z0-9]{8}-[a-z0-9]{4}(?:\.holder(?:\.[^.]+)?)?\.sock$/u.test(name))
          .map((name) => path.join(runtime, name))
      : [];
  const coreResidue = () => ({ pids: [...corePids].filter(fixtureProcessRunning), sockets: coreSockets() });
  const coreGone = () => {
    const { pids, sockets } = coreResidue();
    return pids.length === 0 && sockets.length === 0;
  };
  const captureCore = async (client: HerdrClient, endpoint: string, deadline: AbortSignal) => {
    if (!candidate) throw new Error("未取得候选 Core 路径");
    const observed = await readCoreIdentity(client, endpoint, path.join(candidate.resources, "herdr/linux-x64/herdr-core"), deadline);
    corePids.add(observed.pid);
    for (const pid of observed.holderPids) corePids.add(pid);
    if (core && (core.pid !== observed.pid || core.coreIdHash !== observed.coreIdHash)) throw new Error("Core 实例已变化");
    core = observed;
    return observed;
  };
  const confirmCore = async () => {
    const endpoint = coreEndpoint();
    if (!endpoint) throw new Error("未取得本 Vault 的 Core socket 路径");
    return withCoreSocket(endpoint, (client, deadline) => captureCore(client, endpoint, deadline));
  };
  const close = async () => {
    await withFixtureCleanup(async () => {}, [
      [
        "核对关闭前的 Engine 描述",
        async () => {
          if (!app || (engine && (!fixtureProcessRunning(engine.desktopPid) || !existsSync(descriptor)))) return;
          const current = await readEngine();
          if (engine) expect(current).toEqual(engine);
          else engine = current;
        },
      ],
      [
        "记录关闭前的 Core 与 holder",
        async () => {
          const endpoint = coreEndpoint();
          if (!endpoint || !existsSync(endpoint) || (core && !fixtureProcessRunning(core.pid))) return;
          const knownCore = core;
          try {
            await confirmCore();
          } catch (error) {
            if (!knownCore || !coreGone()) throw error;
          }
        },
      ],
      [
        "关闭 Electron",
        async () => {
          const runningApp = app;
          const child = runningApp?.process();
          if (runningApp && child && child.exitCode === null && child.signalCode === null) {
            await withFixtureDeadline(12_000, () => runningApp.close());
          }
        },
      ],
      [
        "核对桌面与 Engine 退出",
        async () => {
          const pids = [desktopPid, engine?.pid].filter((pid): pid is number => pid !== undefined);
          await expect.poll(() => pids.filter(fixtureProcessRunning), { timeout: 10_000 }).toEqual([]);
        },
      ],
      [
        "核对 Engine 描述已移除",
        () => {
          if (app) expect(lstatSync(descriptor, { throwIfNoEntry: false }), "Vault 中仍有 Engine 描述").toBeUndefined();
        },
      ],
      [
        "接收本夹具 Core 的停止回执",
        async () => {
          const endpoint = coreEndpoint();
          if (!endpoint || !existsSync(endpoint) || (core && !fixtureProcessRunning(core.pid))) return;
          const knownCore = core;
          let requestedStop = false;
          try {
            await withCoreSocket(endpoint, async (client, deadline) => {
              await captureCore(client, endpoint, deadline);
              requestedStop = true;
              const receipt = await client.call<{ stopped: boolean }>("server.stop", {}, deadline);
              stopped = receipt?.stopped === true;
              expect(stopped).toBe(true);
            });
          } catch (error) {
            // A Core may exit between checking the socket and making the stop request.
            if (requestedStop || !knownCore || !coreGone()) throw error;
          }
        },
      ],
      [
        "核对 Core 与 holder 退出",
        async () => {
          await expect.poll(coreResidue, { timeout: 10_000 }).toEqual({ pids: [], sockets: [] });
        },
      ],
      [
        "记录清理证据",
        async () => {
          const { pids, sockets } = coreResidue();
          await withFixtureDeadline(2_000, () =>
            test.info().attach(`${options.identityAttachment}-cleanup`, {
              body: JSON.stringify({
                profile: directory,
                vault,
                descriptor,
                engine,
                core,
                stopped,
                desktopPid,
                liveEnginePids: engine && fixtureProcessRunning(engine.pid) ? [engine.pid] : [],
                liveCorePids: pids,
                sockets,
              }),
              contentType: "application/json",
            }),
          );
        },
      ],
    ]);
    await withFixtureCleanup(async () => {}, [["删除已确认退出的夹具目录", () => withFixtureDeadline(17_000, () => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }))]]);
  };

  return withFixtureCleanup(async () => {
    for (const name of ["vault", "home", "runtime", "desktop", "config", "data", "state", "cache"]) {
      mkdirSync(path.join(directory, name), { mode: 0o700 });
    }
    options.prepareVault?.(vault);
    const disabledProviders = options.disableProviderDetection ? AGENT_CATALOG.map(({ id }) => id) : [];
    if (disabledProviders.length > 0) {
      const agentsDir = path.join(vault, ".huhu", "agent-cli");
      mkdirSync(agentsDir, { recursive: true, mode: 0o700 });
      const settings = emptyAgentSettings();
      for (const id of disabledProviders) settings.agents[id] = { enabled: false };
      writeFileSync(path.join(agentsDir, "agents.json"), JSON.stringify(settings), { flag: "wx", mode: 0o600 });
    }
    candidate = await candidatePackage();
    app = await electron.launch({ executablePath: candidate.executablePath, args: ["--no-sandbox", `--user-data-dir=${userData}`], env });
    desktopPid = app.process().pid;
    const page = await app.firstWindow();
    await engineReady(page);
    engine = await readEngine();
    if (disabledProviders.length > 0) {
      const catalog = await withFixtureDeadline(5_000, () => call<{ id: string; installed: boolean; skipped?: boolean }[]>(page, "agent.catalog.detect", {}));
      expect(catalog.map(({ id, installed, skipped }) => ({ id, installed, skipped }))).toEqual(disabledProviders.map((id) => ({ id, installed: false, skipped: true })));
    }
    const confirmEngine = async () => {
      const current = await readEngine();
      expect(current).toEqual(engine);
      const endpoint = await page.evaluate(async () => {
        const { baseUrl, vaultId } = await window.huhuHost.engine();
        return { baseUrl, vaultId };
      });
      expect(endpoint).toEqual({ baseUrl: current.endpoint, vaultId: current.vaultId });
      return current;
    };
    const identity = await confirmEngine();
    const proof = await confirmCandidate(app, page);
    await test.info().attach(options.identityAttachment, {
      body: JSON.stringify({ ...proof, profile: directory, vault, engine: identity, ...(disabledProviders.length > 0 && { disabledProviders }) }),
      contentType: "application/json",
    });
    opened = true;
    return { app, page, vault, env, resources: candidate.resources, close, confirmEngine, confirmCore };
  }, [
    [
      "清理启动失败的候选桌面",
      async () => {
        if (!opened) await close();
      },
    ],
  ]);
}
