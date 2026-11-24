import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { root, rmTree, USER_DATA_ARG } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

type Source = { sourceId: string; revision: number; enabled: boolean; namespace: string };
type Catalog = { policyRevision: number; catalogRevision: number; entries: { sourceId: string; upstreamIdentity: string; publicKey: string }[] };

async function gateway(page: Page) {
  await engineReady(page);
  await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
  await expect(page.getByTestId("gateway-module")).toBeVisible();
}

async function fromWorkbench<T>(page: Page, name: string, input: object): Promise<T> {
  await page.getByRole("textbox", { name: "测试台", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "调用参数 JSON" }).fill(JSON.stringify(input));
  await page.getByTestId("bench-invoke").click();
  const result = page.getByTestId("bench-result");
  await expect(result).toHaveAttribute("data-ok", "true");
  return JSON.parse((await result.locator("pre").textContent())!) as T;
}

const sourceRef = (source: Source) => ({ sourceId: source.sourceId, expectedRevision: source.revision });

async function publication(page: Page, catalog: Catalog, sourceId: string, upstreamIdentity: string, selected: boolean) {
  await fromWorkbench(page, "mcp.policy.update", {
    expectedCatalogRevision: catalog.catalogRevision, expectedPolicyRevision: catalog.policyRevision,
    choices: [{ sourceId, upstreamIdentity, selected }],
  });
}

async function openClient(page: Page, token: string) {
  const status = await call<{ mcp: { url: string } }>(page, "gateway.get", {});
  const endpoint = status.mcp.url;
  const session = await openMcpSession(endpoint, token);
  return async (method: string, input: object = {}) => {
    const response = await mcpRequest(endpoint, token, mcpRpc(method, input), session);
    expect(response.status).toBe(200);
    return response.json();
  };
}

function events(journal: string): { type: string; name?: string; args?: object }[] {
  return readFileSync(journal, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

function launch(vault: string) {
  return electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
}

test("P1 Gateway 添加本地 stdio、检查并开放 echo，重开 Vault 后公开名稳定", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-mcp-e2e-"));
  const vault = path.join(sandbox, "vault");
  const journal = path.join(sandbox, "fixture.ndjson");
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(vault);
    app = await launch(vault);
    let page = await app.firstWindow();
    await gateway(page);
    const source = await fromWorkbench<Source>(page, "mcp.sources.create", {
      displayName: "E2E Repo", namespace: "e2e_repo",
      configuration: { transport: "stdio", command: process.execPath, args: [path.resolve(import.meta.dirname, "../../fixtures/mcp-stdio.cjs"), journal], environment: {} },
    });
    expect(source.enabled).toBe(false);
    const { configurationFingerprint } = await fromWorkbench<{ configurationFingerprint: string }>(page, "mcp.executionApproval.preview", sourceRef(source));
    await fromWorkbench(page, "mcp.executionApproval.confirm", { ...sourceRef(source), configurationFingerprint });
    expect(await fromWorkbench(page, "mcp.sources.check", sourceRef(source))).toMatchObject({ state: "ready", toolCount: 1 });
    expect(events(journal).map(({ type }) => type)).toEqual(["start"]);
    const catalog = await fromWorkbench<Catalog>(page, "mcp.catalog.list", { sourceId: source.sourceId });
    expect(catalog.entries).toMatchObject([{ publicKey: "e2e_repo__echo" }]);
    await publication(page, catalog, source.sourceId, "echo", true);
    await fromWorkbench(page, "mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
    await call(page, "gateway.update", { capability: "vault.info", exposed: true });
    await call(page, "gateway.mcp.update", { enabled: true });
    const { token } = await call<{ token: string }>(page, "gateway.tokens.create", { name: "MCP E2E" });
    const rpc = await openClient(page, token);
    expect((await rpc("tools/list")).result.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "vault_info" }), expect.objectContaining({ name: "e2e_repo__echo" })]));
    expect((await rpc("tools/call", { name: "e2e_repo__echo", arguments: { value: "round trip" } })).result.structuredContent).toEqual({ value: "round trip" });
    expect(events(journal).filter(({ type }) => type === "call")).toMatchObject([{ name: "echo", args: { value: "round trip" } }]);

    await app.close();
    app = await launch(vault);
    page = await app.firstWindow();
    await gateway(page);
    expect(await fromWorkbench(page, "mcp.sources.get", { sourceId: source.sourceId })).toMatchObject({ source: { enabled: true, namespace: "e2e_repo" }, approved: true });
    const reopened = await openClient(page, token);
    expect((await reopened("tools/list")).result.tools).toContainEqual(expect.objectContaining({ name: "e2e_repo__echo" }));
  } finally {
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});
