import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { HerdrClient } from "../../../packages/herdr-client/src/client.js";
import { machineId } from "../../../packages/vault/src/vault.js";
import { emptyAgentSettings } from "../../../plugins/agent-cli/src/shared/settings.js";
import { fixtureProcessRunning } from "../../../plugins/agent-cli/test/fixtures/core-cli.js";
import { engineReady } from "../knowledge/session-slow-bridge.js";
import { withFixtureCleanup, withFixtureDeadline } from "./candidate-desktop.js";
import { candidateEnvironment, candidatePackage, confirmCandidate } from "./candidate-package.js";

const codexSha256 = "880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971";

export async function openExternalAgentDesktop(config: string) {
  const candidate = await candidatePackage();
  const configuredProvider = process.env["HUHU_CODEX_DISPATCH_BIN"];
  if (!configuredProvider || !path.isAbsolute(configuredProvider)) throw new Error("需要 HUHU_CODEX_DISPATCH_BIN 指定锁定的原生 Codex");
  const provider = await realpath(configuredProvider);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(provider)) hash.update(chunk);
  expect(hash.digest("hex")).toBe(codexSha256);
  const nodeDirectory = path.dirname(await realpath(process.execPath));

  // Core also creates holder sockets, so keep the runtime base short and private.
  const directory = await mkdtemp("/tmp/hc-ea-");
  const vault = path.join(directory, "vault");
  const userData = path.join(directory, "desktop");
  const home = path.join(directory, "home");
  const providerHome = path.join(directory, "provider");
  const runtime = path.join(directory, "run");
  const env = {
    ...candidateEnvironment(),
    PATH: [nodeDirectory, "/usr/bin", "/bin"].join(path.delimiter),
    HOME: home,
    USERPROFILE: home,
    XDG_RUNTIME_DIR: runtime,
    XDG_CONFIG_HOME: path.join(directory, "config"),
    XDG_DATA_HOME: path.join(directory, "data"),
    XDG_STATE_HOME: path.join(directory, "state"),
    XDG_CACHE_HOME: path.join(directory, "cache"),
    HUHU_VAULT: vault,
    HUHU_CODEX_DISPATCH_BIN: provider,
    HUHU_CODEX_DISPATCH_HOME: providerHome,
  };
  const coreExecutable = path.join(candidate.resources, "herdr/linux-x64/herdr-core");
  const corePids = new Set<number>();
  let app: ElectronApplication | undefined;
  let core: { id: string; pid: number } | undefined;
  let coreSocket: string | undefined;
  let enginePid: number | undefined;
  let opened = false;

  async function inspectCore(stop = false) {
    if (!coreSocket) return;
    const socket = await lstat(coreSocket).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return;
      throw error;
    });
    if (!socket) return;
    if (!socket.isSocket() || socket.uid !== process.getuid?.()) throw new Error("Core socket 不属于候选桌面夹具");
    const client = new HerdrClient({ endpoint: coreSocket });
    const signal = AbortSignal.timeout(8_000);
    try {
      await client.connect(signal);
      const status = await client.call<{ core: { id: string }; pid: number; holders: { pid: number }[] }>("server.status", {}, signal);
      const observed = { id: status.core.id, pid: status.pid };
      const pids = [observed.pid, ...status.holders.map(({ pid }) => pid)];
      if (!observed.id || pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)) throw new Error("Core 或 holder 身份无效");
      expect(await readlink(`/proc/${observed.pid}/exe`)).toBe(coreExecutable);
      if (core) expect(observed).toEqual(core);
      core = observed;
      for (const pid of pids) corePids.add(pid);
      if (stop) expect(await client.call<{ stopped: boolean }>("server.stop", {}, signal)).toMatchObject({ stopped: true });
      return observed;
    } finally {
      client.close();
    }
  }

  async function close() {
    await withFixtureCleanup(async () => {}, [
      ["记录关闭前的 Core 与 holder", () => inspectCore()],
      [
        "关闭候选桌面",
        async () => {
          const running = app;
          const child = running?.process();
          if (running && child?.exitCode === null && child.signalCode === null) await withFixtureDeadline(20_000, () => running.close());
        },
      ],
      [
        "停止仍在运行的夹具 Core",
        async () => {
          if (!core || fixtureProcessRunning(core.pid)) await inspectCore(true);
        },
      ],
      [
        "核对桌面、Engine、Core 与 holder 退出",
        async () => {
          const pids = [app?.process().pid, enginePid, ...corePids].filter((pid): pid is number => pid !== undefined);
          const residue = async () => ({
            pids: pids.filter(fixtureProcessRunning),
            sockets: (
              await readdir(runtime).catch((error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return [];
                throw error;
              })
            ).filter((name) => /^huhu-.*\.sock$/u.test(name)),
          });
          await expect.poll(residue, { timeout: 10_000 }).toEqual({ pids: [], sockets: [] });
          await rm(directory, { recursive: true, force: true });
        },
      ],
    ]);
  }

  return withFixtureCleanup(async () => {
    for (const dir of [vault, userData, home, providerHome, runtime, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_STATE_HOME, env.XDG_CACHE_HOME]) await mkdir(dir, { mode: 0o700 });
    await writeFile(path.join(providerHome, "config.toml"), config, { mode: 0o600, flag: "wx" });
    const agentsDir = path.join(vault, ".huhu", "agent-cli");
    await mkdir(agentsDir, { recursive: true, mode: 0o700 });
    // Pin discovery as well as dispatch. Probing login PATH shims under an isolated HOME can recurse.
    const settings = { ...emptyAgentSettings(), agents: { codex: { command: provider }, pi: { enabled: false }, claude: { enabled: false } } };
    await writeFile(path.join(agentsDir, "agents.json"), JSON.stringify(settings), { mode: 0o600, flag: "wx" });
    app = await electron.launch({ executablePath: candidate.executablePath, args: ["--no-sandbox", `--user-data-dir=${userData}`], env, timeout: 25_000 });
    const page = await app.firstWindow({ timeout: 25_000 });
    await engineReady(page);
    const { vaultId, baseUrl } = await page.evaluate(async () => {
      const { vaultId, baseUrl } = await window.huhuHost.engine();
      return { vaultId, baseUrl };
    });
    expect(vaultId).toMatch(/^vault-[a-z0-9]{8,}$/u);
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    coreSocket = path.join(runtime, `huhu-${vaultId.slice(6, 14)}-${machineId().slice(0, 4)}.sock`);
    const engine = await app.evaluate(({ app }) =>
      app
        .getAppMetrics()
        .filter(({ name, type }) => name === "huhu-engine" && type === "Utility")
        .map(({ pid }) => pid),
    );
    expect(engine).toHaveLength(1);
    enginePid = engine[0]!;
    const identity = await confirmCandidate(app, page);
    await test.info().attach("external-agent-candidate-identity", { contentType: "application/json", body: JSON.stringify({ ...identity, provider, codexSha256, vaultId, enginePid }) });
    opened = true;
    return { page, vault, vaultId, baseUrl, env, resources: candidate.resources, inspectCore, close };
  }, [
    [
      "清理启动失败的候选桌面",
      async () => {
        if (!opened) await close();
      },
    ],
  ]);
}
