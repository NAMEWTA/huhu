import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { CapabilityResultSchema } from "../../../packages/contracts/src/capability.js";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { openCandidateDesktop, withFixtureCleanup } from "../helpers/candidate-desktop.js";
import { disposeCandidate } from "../helpers/candidate-package.js";
import { openApp } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

const exec = promisify(execFile);
const external = "automations.terminal.external";
const environment = "automations.terminal.environment";
const variable = "HUHU_RULE_SECRET_FIXTURE";
const packaged = process.env["HUHU_RULE_PACKAGE_ACCEPTANCE"] === "1";
type Status = { ruleVersion: string; revision: string | null; states: Record<string, string> };
type Run = { runId: string; activationId: string };

test.use({ trace: "off", screenshot: "off", video: "off" });
test.afterAll(disposeCandidate);

test("Linux 桌面批准 sh，CLI 和 MCP 配置及运行沿用原请求", async ({ browserName }, testInfo) => {
  void browserName;
  test.skip(process.platform !== "linux", "使用 Linux Secret Service、系统 sh 和真实 Herdr Core");
  test.setTimeout(packaged ? 180_000 : 90_000);
  const candidate = packaged ? await openCandidateDesktop({ identityAttachment: "rule-candidate-identity" }) : undefined;
  const { page, vault, close } = candidate ?? (await openApp());
  const cli = candidate ? path.join(candidate.resources, "bin", "huhu") : process.execPath;
  const cliPrefix = candidate ? [] : [process.env["HUHU_CLI_TEST_BUNDLE"] ?? path.resolve(import.meta.dirname, "../../../apps/cli/dist/cli.mjs")];
  const starts = path.join(vault, "linux-approval-starts.txt");
  const marker = `synthetic-linux-rule-${randomUUID()}`;
  const rotated = `synthetic-linux-rotation-${randomUUID()}`;
  const desktop = <T>(capability: string, input?: object) => call<T>(page, capability, input ?? {});
  let ruleId: string | undefined;
  let tokenId: string | undefined;

  function checkRedaction(text: string, channel: string, token?: string) {
    expect(
      [marker, rotated, ...(token ? [token] : [])].some((value) => text.includes(value)),
      `${channel} 包含敏感值`,
    ).toBe(false);
  }

  async function cliCall(op: string, input: object) {
    const before = await candidate?.confirmEngine();
    return withFixtureCleanup(async () => {
      const args = [...cliPrefix, "call", `${external}.${op}`, "--vault", vault, "--json", "--input-file", "-"];
      const pending = exec(cli, args, { env: candidate?.env ?? process.env, timeout: 15_000 });
      // execFile reports early child exit even if its stdin closes before the write.
      pending.child.stdin?.on("error", () => undefined);
      pending.child.stdin?.end(JSON.stringify(input));
      const { stdout, stderr, code } = await pending.then(
        (output) => ({ ...output, code: 0 }),
        (error: { code?: unknown; stdout?: string; stderr?: string }) => ({ code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }),
      );
      checkRedaction(stdout, "CLI stdout");
      checkRedaction(stderr, "CLI stderr");
      if (code !== 0 && code !== 1) throw new Error(`CLI ${op} 异常退出`);
      let reply: unknown;
      try {
        reply = JSON.parse(stdout);
      } catch {
        throw new Error(`CLI ${op} 未返回 JSON`);
      }
      const result = CapabilityResultSchema.safeParse(reply);
      if (!result.success) throw new Error(`CLI ${op} 返回了无效的能力结果`);
      expect(code).toBe(result.data.ok ? 0 : 1);
      return result.data;
    }, [
      [
        "核对 CLI 调用后的原桌面 Engine",
        async () => {
          if (!candidate) return;
          const after = await candidate.confirmEngine();
          await testInfo.attach("rule-cli-engine-binding", { body: JSON.stringify({ op, cli, before, after }), contentType: "application/json" });
        },
      ],
    ]);
  }

  await withFixtureCleanup(async () => {
    await engineReady(page);
    if (candidate) {
      expect(await desktop("safe.status")).toMatchObject({ initialized: false });
      await desktop("safe.setup", { password: randomUUID() });
      await desktop("safe.lock");
      expect(await desktop("safe.status")).toMatchObject({ initialized: true, locked: true });
    }
    const title = "Linux 系统 sh 的固定批准";
    const command = [
      'test -n "$HUHU_RULE_SECRET_FIXTURE" || exit 7',
      'digest=$(printf "%s" "$HUHU_RULE_SECRET_FIXTURE" | /usr/bin/sha256sum) || exit 8',
      'printf "%s\\n" launched >> linux-approval-starts.txt',
      'printf "linux-fixture-sha256:%s\\n" "${digest%% *}"',
      'printf "%s\\n" "$HUHU_RULE_SECRET_FIXTURE" approved-linux-fixture',
    ].join("; ");
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

    async function checkRun(runId: string, expectedValue: string, otherValue: string) {
      const details = () => desktop<{ body: string; data: { state: string } }>("automations.runs.read", { runId });
      await expect.poll(async () => (await details()).data.state, { timeout: 25_000 }).toBe("succeeded");
      const { body } = await details();
      checkRedaction(body, "规则运行记录");
      const stamp = (value: string) => `linux-fixture-sha256:${createHash("sha256").update(value).digest("hex")}`;
      expect(body.includes(stamp(expectedValue)), "规则进程领取了本轮合成凭据").toBe(true);
      expect(body.includes(stamp(otherValue)), "规则进程领取了另一轮合成凭据").toBe(false);
      expect(body.includes("approved-linux-fixture") && body.includes("***"), "规则运行记录保留脱敏占位").toBe(true);
    }
    await checkRun(original.runId, marker, rotated);

    await desktop("gateway.mcp.update", { enabled: true, transport: "http" });
    const token = await desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "Linux 自动化验收" });
    tokenId = token.id;
    const url = await page.evaluate(async () => `${(await window.huhuHost.engine()).baseUrl}/mcp`);
    expect(new URL(url).hostname).toBe("127.0.0.1");
    if (candidate) expect(url).toBe(`${(await candidate.confirmEngine()).endpoint}/mcp`);
    const session = await openMcpSession(url, token.token);
    const mcp = async <T>(op: string, input: object) => {
      const name = `${external}.${op}`.replaceAll(".", "_");
      const response = await mcpRequest(url, token.token, mcpRpc("tools/call", { name, arguments: input }), session);
      const output = await response.text();
      checkRedaction(output, "MCP 响应", token.token);
      expect(response.status).toBe(200);
      try {
        return (JSON.parse(output) as { result: { isError?: boolean; content?: { type: string; text: string }[]; structuredContent?: { data: T } } }).result;
      } catch {
        throw new Error(`MCP ${op} 未返回 JSON`);
      }
    };
    const updated = await mcp<Status>("save", { ...initial, expectedRevision: first.expectedRevision, changes: [{ name: variable, action: "replace", value: rotated }] });
    expect(updated).toMatchObject({ structuredContent: { data: { revision: expect.any(String), states: { [variable]: "configured" } } } });
    const next = { ...initial, expectedRevision: updated.structuredContent!.data.revision, intentId: randomUUID() };
    expect(next.expectedRevision).not.toBe(first.expectedRevision);
    const mcpRun = await mcp<Run>("run", next);
    expect(mcpRun).toMatchObject({ structuredContent: { data: { runId: expect.any(String), activationId: expect.any(String) } } });
    const mcpIdentity = mcpRun.structuredContent!.data;
    expect(mcpIdentity.runId).not.toBe(original.runId);
    expect(await mcp<Run>("run", next)).toMatchObject({ structuredContent: { data: { runId: mcpIdentity.runId, activationId: mcpIdentity.activationId } } });
    await checkRun(mcpIdentity.runId, rotated, marker);

    await manage.click();
    await approval.getByRole("button", { name: "撤销批准" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已撤销本机批准" })).toBeVisible();
    expect(await cliCall("run", first)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    const denied = await mcp("run", { ...next, intentId: randomUUID() });
    expect(denied).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining('"code":"PERMISSION_DENIED"') }],
    });
    expect(denied.content?.[0]?.text).toContain("终端规则未获本机批准");
    expect((await readFile(starts, "utf8")).trim().split("\n")).toEqual(["launched", "launched"]);
    if (candidate) {
      expect(await desktop("agent.core.status")).toMatchObject({ state: "connected" });
      const core = await candidate.confirmCore();
      const engine = await candidate.confirmEngine();
      expect(url).toBe(`${engine.endpoint}/mcp`);
      await testInfo.attach("rule-mcp-core-binding", { body: JSON.stringify({ engine, mcpEndpoint: url, core }), contentType: "application/json" });
      expect(await desktop("safe.status")).toMatchObject({ initialized: true, locked: true });
    }
  }, [
    [
      "撤销 MCP 令牌",
      async () => {
        if (tokenId) expect(await desktop("gateway.tokens.revoke", { id: tokenId })).toMatchObject({ revoked: true });
      },
    ],
    [
      "清除规则夹具凭据",
      async () => {
        if (ruleId) {
          const current = await desktop<Status>(`${environment}.get`, { ruleId });
          if (current.states[variable] && current.states[variable] !== "unconfigured") {
            const cleared = await desktop<Status>(`${environment}.save`, { ruleId, expectedRevision: current.revision, names: [], changes: [{ name: variable, action: "clear" }] });
            expect(cleared.states[variable] === undefined || cleared.states[variable] === "unconfigured", "规则夹具凭据已清除").toBe(true);
          }
        }
      },
    ],
    ["关闭规则夹具", close],
  ]);
});
