import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { candidateEnvironment, candidatePackage, confirmCandidate, disposeCandidate } from "../helpers/candidate-package.js";
import { root as desktopRoot, rmTree } from "../helpers/launch.js";

const fixture = process.env["HUHU_AGENT_LINUX_PROBE"];
const nativePath = process.env["HUHU_AGENT_PTY_HOST"] ?? path.resolve(desktopRoot, "../../native/agent-pty/bin/huhu-agent-pty");
const packaged = !!process.env["HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT"];
const proofName = "HUHU_AGENT_FIXTURE_PROOF";
const plainName = "HUHU_AGENT_FIXTURE_PLAIN";
const protectedName = "HUHU_AGENT_FIXTURE_SECRET";

interface Observation {
  event: "ready" | "resized" | "input";
  tty: boolean[];
  pid: number;
  detached: number;
  columns: number;
  rows: number;
  plainMatched: boolean;
  secretMatched: boolean;
}
interface Session {
  id: string;
  requestId: string;
  state: string;
  terminalId: string | null;
  exitCode?: number;
}
interface Profile {
  id: string;
  revision: string;
  name: string;
}
interface Reply<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string };
}

test.skip(process.platform !== "linux" || process.arch !== "x64" || !fixture || !existsSync(fixture), "需要 Linux x64 和 HUHU_AGENT_LINUX_PROBE");
test.afterAll(disposeCandidate);

async function startDesktop(protection: boolean) {
  const directory = mkdtempSync(path.join(tmpdir(), "huhu-agent-e2e-"));
  for (const dir of ["vault", "home", "runtime", "desktop", "config", "data", "state", "cache"]) {
    mkdirSync(path.join(directory, dir), { mode: 0o700 });
  }
  const program = path.join(directory, "agent");
  const proof = path.join(directory, "proof.jsonl");
  copyFileSync(fixture!, program);
  chmodSync(program, 0o700);
  const env = {
    ...candidateEnvironment(),
    HOME: path.join(directory, "home"),
    XDG_RUNTIME_DIR: path.join(directory, "runtime"),
    XDG_CONFIG_HOME: path.join(directory, "config"),
    XDG_DATA_HOME: path.join(directory, "data"),
    XDG_STATE_HOME: path.join(directory, "state"),
    XDG_CACHE_HOME: path.join(directory, "cache"),
    SHELL: "/bin/sh",
    HUHU_VAULT: path.join(directory, "vault"),
    ...(!protection && { DBUS_SESSION_BUS_ADDRESS: "unix:path=" + path.join(directory, "unavailable-bus") }),
    ...(!packaged && { HUHU_AGENT_PTY_HOST: protection ? nativePath : path.join(directory, "unavailable-helper") }),
    ...(!packaged && process.env["HUHU_HERDR_BIN"] && { HUHU_HERDR_BIN: process.env["HUHU_HERDR_BIN"] }),
  };
  const args = ["--no-sandbox", "--user-data-dir=" + path.join(directory, "desktop")];
  try {
    const app = packaged ? await electron.launch({ executablePath: (await candidatePackage()).executablePath, args, env }) : await electron.launch({ args: [desktopRoot, ...args], env });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
      if (packaged) await confirmCandidate(app, page);
      const settings = await call<{ settings: { revision: number } }>(page, "agent.settings.get", {});
      await call(page, "agent.settings.update", { expectedRevision: settings.settings.revision, defaultAgent: "codex", agents: { codex: { command: program, args: [] } } });
      return {
        app,
        page,
        proof,
        program,
        close: async () => {
          try {
            await app.close();
          } finally {
            rmTree(directory);
          }
        },
      };
    } catch (error) {
      await app.close();
      throw error;
    }
  } catch (error) {
    rmTree(directory);
    throw error;
  }
}

async function call<T>(page: Page, capability: string, input: unknown): Promise<T> {
  const reply = await page.evaluate(
    async ({ capability, input }) => {
      const endpoint = await window.huhuHost.engine();
      const response = await fetch(endpoint.baseUrl + "/api/v1/call", {
        method: "POST",
        headers: { authorization: "Bearer " + endpoint.token, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      return (await response.json()) as Reply<T>;
    },
    { capability, input },
  );
  if (!reply.ok) throw new Error(`${capability} ${reply.error?.code} ${reply.error?.message}`);
  return reply.data;
}

function observe(proof: string): Observation[] {
  if (!existsSync(proof)) return [];
  // A resize may be written while Playwright is reading the previous observations.
  return readFileSync(proof, "utf8")
    .split("\n")
    .slice(0, -1)
    .map((line) => JSON.parse(line) as Observation);
}

async function preview(page: Page, profile: Profile) {
  await page.locator(".agent-add-cli").click();
  await page.getByRole("button", { name: "使用启动环境…" }).click();
  const dialog = page.getByRole("dialog", { name: "使用启动环境", exact: true });
  await dialog.getByRole("combobox", { name: "启动环境", exact: true }).selectOption(profile.id);
  await dialog.getByRole("button", { name: "预览启动" }).click();
  await expect(dialog.getByRole("button", { name: "确认启动" })).toBeVisible();
  return dialog;
}

async function currentSession(page: Page): Promise<Session> {
  const sessions = () => call<Session[]>(page, "agent.sessions.list", {});
  await expect.poll(async () => (await sessions()).filter(({ state }) => state === "running")).toHaveLength(1);
  return (await sessions()).find(({ state }) => state === "running")!;
}

async function finishFromTerminal(page: Page, session: Session, proof: string, returnsToShell = false) {
  const pane = page.getByTestId("workspace-pane").and(page.locator(`[data-session-id="${session.id}"]`));
  await expect(pane.locator(".xterm")).toBeVisible();
  await pane.locator(".xterm").click();
  await page.keyboard.type("q");
  await expect.poll(() => observe(proof).some(({ event }) => event === "input")).toBe(true);
  const current = async () => (await call<Session[]>(page, "agent.sessions.list", {})).find(({ id }) => id === session.id);
  let exitCode = 17;
  if (returnsToShell) {
    const output = async () => (await call<{ text: string }>(page, "agent.sessions.output", { id: session.id })).text;
    await expect.poll(output).toContain("HUHU_PTY AGENT_EXIT 17");
    await expect.poll(current).toMatchObject({ state: "running", terminalId: session.terminalId });
    await page.keyboard.type('printf "return-shell:%s:%s\\n" "$HUHU_AGENT_FIXTURE_PLAIN" "${HUHU_AGENT_FIXTURE_SECRET+present}"');
    await page.keyboard.press("Enter");
    await expect.poll(output).toMatch(/return-shell:fixture-ordinary:\r?\n/);
    await page.keyboard.type("exit 23");
    await page.keyboard.press("Enter");
    exitCode = 23;
  }
  await expect.poll(current).toMatchObject({ state: "exited", exitCode, terminalId: session.terminalId });
}

test("Linux 普通 Agent 环境可编辑并在保护服务缺席时进入真实 Core", async () => {
  const desk = await startDesktop(false);
  try {
    const { page, proof } = desk;
    const profile = await call<Profile>(page, "agent.launch.environments.save", {
      expectedRevision: null,
      name: "Linux 普通实测",
      provider: "codex",
      ordinary: [
        { name: proofName, value: proof },
        { name: plainName, value: "original" },
      ],
      protectedNames: [],
      changes: [],
    });
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    await page.getByTestId("settings-nav-agent-cli").click();
    const settings = page.getByTestId("agent-environment-settings");
    await settings.getByRole("button", { name: "编辑启动环境 " + profile.name }).click();
    const edit = page.getByRole("dialog", { name: "编辑启动环境" });
    await expect(edit.getByLabel("变量值", { exact: true }).nth(1)).toHaveValue("original");
    await edit.getByLabel("变量值", { exact: true }).nth(1).fill("fixture-ordinary");
    await edit.getByRole("button", { name: "保存启动环境" }).click();
    await expect(edit).toBeHidden();

    await page.getByRole("button", { name: "Agent CLI" }).first().click();
    const dialog = await preview(page, profile);
    await expect(dialog).toContainText(plainName);
    await expect(dialog).not.toContainText("fixture-ordinary");
    await dialog.getByRole("button", { name: "确认启动" }).click();
    await expect.poll(() => observe(proof).find(({ event }) => event === "ready")).toMatchObject({ tty: [true, true, true], plainMatched: true, secretMatched: false });
    await finishFromTerminal(page, await currentSession(page), proof);
  } finally {
    await desk.close();
  }
});

test("Linux 受保护 Agent 在 Safe 三态使用真实 PTY、键盘和 resize，并回收后代", async () => {
  test.skip(!process.env["HUHU_ACCEPTANCE_DBUS_ADDRESS"] || process.env["DBUS_SESSION_BUS_ADDRESS"] !== process.env["HUHU_ACCEPTANCE_DBUS_ADDRESS"], "需要隔离的 Secret Service");
  test.skip(!packaged && !existsSync(nativePath), "需要 Linux 原生宿主");
  test.setTimeout(120_000);
  const desk = await startDesktop(true);
  const { app, page, proof, program } = desk;
  const synthetic = "fixture-agent-private-" + randomUUID();
  let profile: Profile | undefined;
  try {
    profile = await call<Profile>(page, "agent.launch.environments.save", {
      expectedRevision: null,
      name: "Linux 保护实测",
      provider: "codex",
      ordinary: [
        { name: proofName, value: proof },
        { name: plainName, value: "fixture-ordinary" },
        { name: "HUHU_AGENT_FIXTURE_SHA", value: createHash("sha256").update(synthetic).digest("hex") },
        { name: "HUHU_AGENT_FIXTURE_SPAWN", value: "1" },
      ],
      protectedNames: [protectedName],
      changes: [{ name: protectedName, action: "replace", value: synthetic }],
    });
    expect(await call(page, "safe.status", {})).toMatchObject({ initialized: false });
    await page.getByRole("button", { name: "Agent CLI" }).first().click();

    for (const stage of ["uninitialized", "locked", "disabled"]) {
      if (stage === "locked") {
        await call(page, "safe.setup", { password: "fixture-safe-password-2026" });
        await call(page, "safe.lock", {});
        expect(await call(page, "safe.status", {})).toMatchObject({ initialized: true, locked: true });
      }
      if (stage === "disabled") {
        expect(await call(page, "plugins.setEnabled", { id: "safe", enabled: false })).toMatchObject({ state: "disabled" });
      }
      rmSync(proof, { force: true });
      const dialog = await preview(page, profile);
      await expect(dialog).toContainText(program);
      await expect(dialog).toContainText(protectedName);
      await expect(dialog).not.toContainText(synthetic);
      expect(existsSync(proof)).toBe(false);
      await dialog.getByRole("button", { name: "确认启动" }).click();
      await expect.poll(() => observe(proof).find(({ event }) => event === "ready")).toMatchObject({ tty: [true, true, true], plainMatched: true, secretMatched: true });
      const started = observe(proof).find(({ event }) => event === "ready")!;
      expect(started.columns).toBeGreaterThan(0);
      expect(started.rows).toBeGreaterThan(0);
      expect(started.detached).toBeGreaterThan(0);
      const session = await currentSession(page);
      const terminalOutput = () => call<{ text: string }>(page, "agent.sessions.output", { id: session.id });
      await expect.poll(async () => (await terminalOutput()).text).toContain("fixture:redact [REDACTED]");
      expect((await terminalOutput()).text).not.toContain(synthetic);
      if (stage === "uninitialized") {
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(920, 680));
        await expect.poll(() => observe(proof).some(({ event, columns, rows }) => event === "resized" && (columns !== started.columns || rows !== started.rows))).toBe(true);
        await page.getByRole("button", { name: "知识库" }).first().click();
        await page.getByRole("button", { name: "Agent CLI" }).first().click();
      }
      await finishFromTerminal(page, session, proof, true);
      await expect.poll(() => existsSync(`/proc/${started.detached}`)).toBe(false);
      expect(observe(proof).filter(({ event }) => event === "ready")).toHaveLength(1);
    }

    rmSync(proof, { force: true });
    const dialog = await preview(page, profile);
    renameSync(program, program + ".previous");
    copyFileSync(fixture!, program);
    chmodSync(program, 0o700);
    const response = page.waitForResponse(
      (candidate) => candidate.url().endsWith("/api/v1/call") && candidate.request().method() === "POST" && (candidate.request().postDataJSON() as { capability?: string }).capability === "agent.workspace.launchProtected",
    );
    await dialog.getByRole("button", { name: "确认启动" }).click();
    expect(await (await response).json()).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(existsSync(proof)).toBe(false);
  } finally {
    try {
      if (profile) await call(page, "agent.launch.environments.remove", { id: profile.id, expectedRevision: profile.revision });
    } finally {
      await desk.close();
    }
  }
});
