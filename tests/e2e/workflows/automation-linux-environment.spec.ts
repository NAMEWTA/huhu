import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { CapabilityResultSchema } from "../../../packages/contracts/src/capability.js";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { openApp } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

const exec = promisify(execFile);
const external = "automations.terminal.external";
const environment = "automations.terminal.environment";
const variable = "HUHU_RULE_SECRET_FIXTURE";
type Status = { ruleVersion: string; revision: string | null; states: Record<string, string> };
type Run = { runId: string; activationId: string };

test("Linux 桌面批准 sh，CLI 和 MCP 配置及运行沿用原请求", async ({}, testInfo) => {
  test.skip(process.platform !== "linux", "使用 Linux Secret Service、系统 sh 和真实 Herdr Core");
  test.setTimeout(90_000);
  const cli = process.env["HUHU_CLI_TEST_BUNDLE"] ?? path.resolve(import.meta.dirname, "../../../apps/cli/dist/cli.mjs");
  const { page, vault, close } = await openApp();
  const starts = path.join(vault, "linux-approval-starts.txt");
  const marker = `synthetic-linux-rule-${randomUUID()}`;
  const rotated = `synthetic-linux-rotation-${randomUUID()}`;
  const desktop = <T>(capability: string, input?: object) => call<T>(page, capability, input ?? {});
  let ruleId: string | undefined;
  let tokenId: string | undefined;

  async function cliCall(op: string, input: object) {
    await mkdir(testInfo.outputDir, { recursive: true });
    const file = testInfo.outputPath(`cli-fixture-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify(input), { flag: "wx", mode: 0o600 });
    try {
      const args = [cli, "call", `${external}.${op}`, "--vault", vault, "--json", "--input-file", file];
      const { stdout } = await exec(process.execPath, args, { timeout: 15_000 }).catch((error: { code?: unknown; stdout?: string }) => {
        if (error.code !== 1 || !error.stdout) throw error;
        return { stdout: error.stdout };
      });
      expect(stdout).not.toContain(marker);
      expect(stdout).not.toContain(rotated);
      return CapabilityResultSchema.parse(JSON.parse(stdout));
    } finally {
      await unlink(file);
    }
  }

  try {
    await engineReady(page);
    const title = "Linux 系统 sh 的固定批准";
    const command = 'test -n "$HUHU_RULE_SECRET_FIXTURE" || exit 7; printf "%s\\n" launched >> linux-approval-starts.txt; printf "%s\\n" "$HUHU_RULE_SECRET_FIXTURE" approved-linux-fixture';
    const rule = await desktop<{ id: string; version: string }>("automations.create", {
      title,
      trigger: { preset: "every15", cron: "*/15 * * * *", zone: "UTC" },
      action: { kind: "terminal", shell: "sh", command, spaceId: null },
    });
    ruleId = rule.id;
    const id = { ruleId };
    await expect(cliCall("status", id)).resolves.toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    for (const op of ["status", "save", "run"]) await desktop("gateway.update", { capability: `${external}.${op}`, exposed: true });
    expect(await cliCall("status", id)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });

    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-row").filter({ hasText: title }).click();
    const manage = page.getByRole("button", { name: "管理 CLI / MCP 授权" });
    const approval = page.getByRole("dialog", { name: "终端规则的外部授权" });
    await manage.click();
    await expect(approval.getByRole("region", { name: "sh 命令" })).toContainText(command);
    await expect(approval.getByText(await realpath("/bin/sh"), { exact: true })).toBeVisible();
    await approval.getByLabel("批准的变量名").fill(variable);
    await approval.getByRole("button", { name: "批准这条规则" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已批准本机手动使用" })).toBeVisible();

    const initial = { ...id, expectedRuleVersion: rule.version, expectedRevision: null };
    const configured = await cliCall("save", { ...initial, changes: [{ name: variable, action: "replace", value: marker }] });
    expect(configured).toMatchObject({ ok: true, data: { states: { [variable]: "configured" } } });
    if (!configured.ok) throw new Error(configured.error.code);
    const first = { ...initial, expectedRevision: (configured.data as Status).revision, intentId: randomUUID() };
    const launched = await cliCall("run", first);
    expect(launched).toMatchObject({ ok: true });
    if (!launched.ok) throw new Error(launched.error.code);
    const original = launched.data as Run;
    expect(await cliCall("run", first)).toMatchObject({ ok: true, data: { runId: original.runId, activationId: original.activationId } });

    async function checkRun(runId: string) {
      const details = () => desktop<{ body: string; data: { state: string } }>("automations.runs.read", { runId });
      await expect.poll(async () => (await details()).data.state, { timeout: 25_000 }).toBe("succeeded");
      const { body } = await details();
      expect(body).toContain("approved-linux-fixture");
      expect(body).toContain("***");
      expect(body).not.toContain(marker);
      expect(body).not.toContain(rotated);
    }
    await checkRun(original.runId);

    await desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    const token = await desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "Linux 自动化验收" });
    tokenId = token.id;
    const url = await page.evaluate(async () => `${(await window.huhuHost.engine()).baseUrl}/mcp`);
    expect(new URL(url).hostname).toBe("127.0.0.1");
    const session = await openMcpSession(url, token.token);
    const mcp = async <T>(op: string, input: object) => {
      const name = `${external}.${op}`.replaceAll(".", "_");
      const response = await mcpRequest(url, token.token, mcpRpc("tools/call", { name, arguments: input }), session);
      expect(response.status).toBe(200);
      return (await response.json()).result as { isError?: boolean; structuredContent?: { data: T } };
    };
    const updated = await mcp<Status>("save", { ...initial, expectedRevision: first.expectedRevision, changes: [{ name: variable, action: "replace", value: rotated }] });
    expect(updated).toMatchObject({ structuredContent: { data: { states: { [variable]: "configured" } } } });
    const next = { ...initial, expectedRevision: updated.structuredContent!.data.revision, intentId: randomUUID() };
    const mcpRun = await mcp<Run>("run", next);
    expect(mcpRun).toMatchObject({ structuredContent: { data: { runId: expect.any(String), activationId: expect.any(String) } } });
    const mcpIdentity = mcpRun.structuredContent!.data;
    expect(mcpIdentity.runId).not.toBe(original.runId);
    expect(await mcp<Run>("run", next)).toMatchObject({ structuredContent: { data: { runId: mcpIdentity.runId, activationId: mcpIdentity.activationId } } });
    await checkRun(mcpIdentity.runId);

    await manage.click();
    await approval.getByRole("button", { name: "撤销批准" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已撤销本机批准" })).toBeVisible();
    expect(await cliCall("run", first)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await mcp("run", { ...next, intentId: randomUUID() })).toMatchObject({ isError: true });
    expect((await readFile(starts, "utf8")).trim().split("\n")).toEqual(["launched", "launched"]);
  } finally {
    try {
      if (tokenId) await desktop("gateway.tokens.revoke", { id: tokenId });
      if (ruleId) {
        const current = await desktop<Status>(`${environment}.get`, { ruleId });
        if (current.states[variable] === "configured") {
          await desktop(`${environment}.save`, { ruleId, expectedRevision: current.revision, names: [], changes: [{ name: variable, action: "clear" }] });
        }
      }
    } finally {
      await close();
    }
  }
});
