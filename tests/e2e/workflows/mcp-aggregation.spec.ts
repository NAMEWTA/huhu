import { _electron as electron, chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { mcpRequest, mcpRpc, openMcpSession, openRecoverableMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { localUpstream } from "../../../packages/kernel/test/fixtures/mcp-upstream.js";
import { loopbackOAuth } from "../../../packages/kernel/test/fixtures/mcp-oauth.js";
import { openApp, root, rmTree, USER_DATA_ARG } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";
import { fixtureProcessRunning } from "../../../plugins/agent-cli/test/fixtures/core-cli.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

type Source = { sourceId: string; revision: number; enabled: boolean; namespace: string };
type Catalog = { policyRevision: number; catalogRevision: number; entries: { sourceId: string; upstreamIdentity: string; publicKey: string }[] };
const stdioFixture = path.resolve(import.meta.dirname, "../../fixtures/mcp-stdio.cjs");

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

function events(journal: string): { type: string; name?: string; args?: object; pid?: number; helperPid?: number }[] {
  return readFileSync(journal, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

function launch(vault: string) {
  return electron.launch({ args: [root, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: vault } });
}

test("UX14 工具授权区分可用操作，撤销后同一 MCP 会话拒绝缓存工具名", async () => {
  const { page, vault, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await gateway(page);
    const filter = page.getByRole("textbox", { name: "筛选能力" });
    const policy = page.getByRole("region", { name: "工具开放策略" });
    await filter.fill("ux14-no-matching-capability");
    await expect(policy.getByText("没有匹配的能力", { exact: true })).toBeVisible();
    await expect(policy.getByRole("checkbox", { name: "选择全部匹配项" })).toBeDisabled();
    const capabilities = ["notes.list", "notes.read"];
    for (const capability of capabilities) {
      await filter.fill(capability);
      await policy.getByRole("checkbox", { name: `选择 ${capability}`, exact: true }).check();
    }
    await expect(policy.getByRole("status").filter({ hasText: "选中 2 项" })).toBeVisible();
    await expect(policy.getByRole("button", { name: "关闭所选" })).toBeDisabled();
    await policy.getByRole("button", { name: "开启所选" }).click();
    const grant = page.getByRole("dialog", { name: "开启所选" });
    await expect(grant.getByRole("listitem")).toHaveCount(2);
    await grant.getByRole("button", { name: "保存选择" }).click();
    await expect(policy.getByRole("status").filter({ hasText: "已保存 2 项工具选择" })).toBeVisible();
    await expect(policy.locator('[data-cap="notes.read"]')).toContainText("服务已关闭");

    await call(page, "gateway.mcp.update", { enabled: true });
    const { token } = await call<{ token: string }>(page, "gateway.tokens.create", { name: "UX14 fixture" });
    const rpc = await openClient(page, token);
    const { result: listed } = await rpc("tools/list");
    const cached = listed.tools.find(({ name }: { name: string }) => name === "notes_list");
    expect(cached).toBeDefined();
    expect((await rpc("tools/call", { name: cached.name, arguments: {} })).result.structuredContent.data).toEqual(expect.any(Array));

    await call(page, "web.share.start", { mode: "local", port: 0 });
    const { links } = await call<{ links: string[] }>(page, "web.invitations.create", {});
    browser = await chromium.launch();
    const web = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await web.goto(links[0]!);
    await web.getByRole("button", { name: "能力网关", exact: true }).click();
    await web.getByRole("textbox", { name: "筛选能力" }).fill("notes.list");
    const webPolicy = web.getByRole("region", { name: "工具开放策略" });
    await expect(webPolicy.getByText(/请在桌面工作台更改授权/)).toBeVisible();
    const webGrant = webPolicy.getByRole("switch", { name: "暴露 notes.list" });
    await expect(webGrant).toBeChecked();
    await expect(webGrant).toBeDisabled();
    await browser.close();
    browser = undefined;

    const revokeButton = policy.getByRole("button", { name: "关闭所选" });
    await revokeButton.click();
    const revoke = page.getByRole("dialog", { name: "关闭所选" });
    await expect(revoke.getByRole("button", { name: "取消" })).toBeFocused();
    await expect(revoke.getByRole("listitem")).toHaveCount(2);
    await revoke.getByRole("button", { name: "保存选择" }).click();
    await expect(revoke).toBeHidden();
    const denied = (await rpc("tools/call", { name: cached.name, arguments: {} })).result;
    expect(denied.isError).toBe(true);
    expect(JSON.parse(denied.content[0].text)).toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
    expect((await rpc("tools/list")).result.tools).not.toContainEqual(expect.objectContaining({ name: cached.name }));

    await call(page, "plugins.setEnabled", { id: "ssh", enabled: false });
    await filter.fill("ssh.hosts.list");
    const unavailable = policy.locator('[data-cap="ssh.hosts.list"]');
    await expect(unavailable).toContainText("模块已停用");
    await expect(unavailable.getByRole("switch")).toBeDisabled();
    await expect(page.getByRole("form", { name: "允许外部工具访问的 SSH 主机" })).toContainText("SSH 模块已停用。");

    expect(await page.evaluate((location) => window.huhuHost.vault.open(location, { kind: "open", readOnly: true }), vault)).toMatchObject({ ok: true });
    await page.reload();
    await gateway(page);
    await expect(policy.getByText(/Vault 以只读方式打开/)).toBeVisible();
    await filter.fill("notes.list");
    await expect(policy.getByRole("switch", { name: "暴露 notes.list" })).toBeDisabled();
  } finally {
    await browser?.close();
    await close();
  }
});

test("P1 Gateway 添加本地 stdio、检查并开放 echo，重开 Vault 后公开名稳定", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-mcp-e2e-"));
  const vault = path.join(sandbox, "vault");
  const journal = path.join(sandbox, "fixture.ndjson");
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    mkdirSync(vault);
    app = await launch(vault);
    let page = await app.firstWindow();
    await gateway(page);
    const source = await fromWorkbench<Source>(page, "mcp.sources.create", {
      displayName: "E2E Repo", namespace: "e2e_repo",
      configuration: { transport: "stdio", command: process.execPath, args: [stdioFixture, journal], environment: {} },
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

test("关闭发布后短检结束即回收，停插件和切库无旧连接", async () => {
  test.setTimeout(90_000);
  const { page, vault, close } = await openApp();
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-mcp-lifetimes-"));
  try {
    const definition = path.join(sandbox, "stdio.json");
    writeFileSync(definition, JSON.stringify({ helper: process.platform !== "win32" }));
    await gateway(page);
    async function add(namespace: string) {
      const journal = path.join(sandbox, namespace + ".ndjson");
      const created = await fromWorkbench<Source>(page, "mcp.sources.create", {
        displayName: namespace, namespace,
        configuration: { transport: "stdio", command: process.execPath, args: [stdioFixture, journal, definition], environment: {} },
      });
      const input = sourceRef(created);
      const { configurationFingerprint } = await fromWorkbench<{ configurationFingerprint: string }>(page, "mcp.executionApproval.preview", input);
      await fromWorkbench(page, "mcp.executionApproval.confirm", { ...input, configurationFingerprint });
      await fromWorkbench(page, "mcp.sources.check", input);
      const catalog = await fromWorkbench<Catalog>(page, "mcp.catalog.list", { sourceId: created.sourceId });
      await publication(page, catalog, created.sourceId, "echo", true);
      const source = await fromWorkbench<Source>(page, "mcp.sources.setEnabled", { ...input, enabled: true });
      const starts = () => events(journal).filter(({ type }) => type === "start");
      return {
        source, starts,
        live: () => starts().flatMap(({ pid, helperPid }) => [pid, helperPid]).filter((pid): pid is number => pid !== undefined && fixtureProcessRunning(pid)),
        calls: () => events(journal).filter(({ type }) => type === "call").map(({ args }) => args),
      };
    }
    const removed = await add("removed");
    const kept = await add("kept");
    const publishing = (enabled: boolean) => call<{ url: string }>(page, "gateway.mcp.update", { enabled });
    const status = () => call<{ mcp: { url: string } }>(page, "gateway.get", {});
    await publishing(true);
    const { mcp: { url } } = await status();
    const issue = async (name: string) => (await call<{ token: string }>(page, "gateway.tokens.create", { name })).token;
    const first = await issue("Lifecycle first");
    const second = await issue("Lifecycle peer");
    const old = await openRecoverableMcpSession(url, first);
    const peer = await openClient(page, second);
    const input = (source: string, value: string) => ({ name: source + "__echo", arguments: { value } });
    expect((await peer("tools/list")).result.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "removed__echo" }), expect.objectContaining({ name: "kept__echo" }),
    ]));
    const failed = await mcpRequest(url, first, mcpRpc("tools/call", input("removed", "fixture-disconnect")), old.handle);
    expect((await failed.json()).error.data.code).toBe("RUN_UNKNOWN");
    const preview = await fromWorkbench<{ policyRevision: number }>(page, "mcp.sources.deletePreview", sourceRef(removed.source));
    await fromWorkbench(page, "mcp.sources.delete", { ...sourceRef(removed.source), expectedPolicyRevision: preview.policyRevision });
    await expect.poll(removed.live).toEqual([]);
    expect((await peer("tools/call", input("removed", "stale"))).error.data.code).toBe("CAPABILITY_NOT_FOUND");
    expect((await peer("tools/call", input("kept", "peer"))).result.structuredContent).toEqual({ value: "peer" });

    await publishing(false);
    await expect.poll(kept.live).toEqual([]);
    const previous = kept.starts().length;
    expect(await fromWorkbench(page, "mcp.sources.check", sourceRef(kept.source))).toMatchObject({ state: "ready" });
    expect(kept.starts()).toHaveLength(previous + 1);
    expect(kept.live()).toEqual([]);
    await publishing(true);
    await (await openClient(page, second))("tools/list");
    expect(kept.live().length).toBeGreaterThan(0);
    await call(page, "plugins.setEnabled", { id: "mcp", enabled: false });
    try {
      await expect.poll(kept.live).toEqual([]);
      expect((await mcpRequest(url, first, mcpRpc("tools/list"), old.handle)).ok).toBe(false);
    } finally {
      await call(page, "plugins.setEnabled", { id: "mcp", enabled: true });
    }
    await publishing(true);
    const beforeSwitch = await openClient(page, second);
    expect((await beforeSwitch("tools/list")).result.tools).toContainEqual(expect.objectContaining({ name: "kept__echo" }));

    const open = async (location: string, kind: "new" | "open") => {
      expect(await page.evaluate(([location, kind]) => window.huhuHost.vault.open(location, { kind }), [location, kind] as const)).toMatchObject({ ok: true });
      await page.reload();
      await gateway(page);
    };
    await open(path.join(sandbox, "other"), "new");
    expect(kept.live()).toEqual([]);
    await publishing(true);
    const secondVault = await openClient(page, await issue("Lifecycle other Vault"));
    expect((await secondVault("tools/list")).result.tools.map(({ name }: { name: string }) => name)).not.toContain("kept__echo");
    const otherUrl = (await status()).mcp.url;
    expect((await mcpRequest(otherUrl, second, mcpRpc("tools/call", input("kept", "wrong Vault")), old.handle)).ok).toBe(false);
    await open(vault, "open");
    await publishing(true);
    const fresh = await openClient(page, second);
    expect((await fresh("tools/call", input("kept", "fresh"))).result.structuredContent).toEqual({ value: "fresh" });
    expect(removed.calls()).toEqual([{ value: "fixture-disconnect" }]);
    expect(kept.calls()).toEqual([{ value: "peer" }, { value: "fresh" }]);
  } finally {
    try { await close(); }
    finally { rmTree(sandbox); }
  }
});

test("L11 同一 MCP 目录保留外部工具，账本按授权开放、撤权与停用", async () => {
  const { page, vault, close } = await openApp();
  let upstream: Awaited<ReturnType<typeof localUpstream>> | undefined;
  try {
    await gateway(page);
    const { id: bookId } = await call<{ id: string }>(page, "ledger.books.create", {
      name: "能力目录账本", defaultCurrency: "TWD", timeZone: "Asia/Taipei", firstAccount: { name: "银行" },
    });
    const input = { bookId };
    const desktop = await call(page, "ledger.records.list", input);

    upstream = await localUpstream("streamable-http");
    const source = await fromWorkbench<Source>(page, "mcp.sources.create", {
      displayName: "账本联合验收来源", namespace: "ledger_fixture",
      configuration: { transport: "streamable-http", url: upstream.url, headers: {}, authentication: { kind: "none" } },
    });
    expect(await fromWorkbench(page, "mcp.sources.check", sourceRef(source))).toMatchObject({ state: "ready" });
    const catalog = await fromWorkbench<Catalog>(page, "mcp.catalog.list", { sourceId: source.sourceId });
    await publication(page, catalog, source.sourceId, "echo", true);
    await fromWorkbench(page, "mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
    await call(page, "gateway.mcp.update", { enabled: true });
    const { token } = await call<{ token: string }>(page, "gateway.tokens.create", { name: "账本联合验收" });
    const rpc = await openClient(page, token);
    const tool = "ledger_records_list";
    const echo = "ledger_fixture__echo";
    const listed = async () => (await rpc("tools/list")).result.tools.map(({ name }: { name: string }) => name);
    const view = () => rpc("tools/call", { name: tool, arguments: input });
    const selectLedger = (exposed: boolean) => call(page, "gateway.update", { capability: "ledger.records.list", exposed });
    expect(await listed()).toContain(echo);
    expect(await listed()).not.toContain(tool);

    await selectLedger(true);
    expect(await listed()).toEqual(expect.arrayContaining([tool, echo]));
    expect((await view()).result.structuredContent.data).toEqual(desktop);
    const cli = path.resolve(import.meta.dirname, "../../../apps/cli/dist/cli.mjs");
    const { stdout } = await promisify(execFile)(process.execPath, [cli, "call", "ledger.records.list", "--vault", vault, "--input-json", JSON.stringify(input), "--json"]);
    expect(JSON.parse(stdout)).toEqual({ ok: true, data: desktop });

    await selectLedger(false);
    expect(await listed()).not.toContain(tool);
    expect((await view()).result).toMatchObject({ isError: true });
    await selectLedger(true);
    await call(page, "plugins.setEnabled", { id: "ledger", enabled: false });
    expect(await listed()).not.toContain(tool);
    expect((await view()).result).toMatchObject({ isError: true });
    expect((await rpc("tools/call", { name: echo, arguments: { value: "独立来源" } })).result.structuredContent)
      .toEqual({ value: "独立来源", transport: "streamable-http" });
  } finally {
    try { await close(); }
    finally { await upstream?.close(); }
  }
});

test("P2 导入三个本地来源、聚合同名工具、刷新分页目录并即时撤权", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-mcp-p2-e2e-"));
  const vault = path.join(sandbox, "vault");
  const journal = path.join(sandbox, "fixture.ndjson");
  const definition = path.join(sandbox, "definition.json");
  const names = ["echo", "with__separator", "非 ASCII"];
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  let http: Awaited<ReturnType<typeof localUpstream>> | undefined;
  let sse: Awaited<ReturnType<typeof localUpstream>> | undefined;
  try {
    mkdirSync(vault);
    writeFileSync(definition, JSON.stringify({ names, pageSize: 1 }));
    http = await localUpstream("streamable-http");
    sse = await localUpstream("sse");
    app = await launch(vault);
    const page = await app.firstWindow();
    await gateway(page);
    const embeddedCredentials = new URL(http.url);
    embeddedCredentials.username = "fixture";
    embeddedCredentials.password = "synthetic-p2-secret";
    const text = JSON.stringify({ mcpServers: {
      repo: { command: process.execPath, args: [stdioFixture, journal, definition] },
      http_repo: { url: http.url, type: "streamable-http" },
      sse_repo: { url: sse.url, type: "sse" },
      blocked: { url: embeddedCredentials.href },
    } });
    const preview = await fromWorkbench<{
      previewId: string; sourcesRevision: number; entries: { entryId: string; state: string }[];
    }>(page, "mcp.sources.importPreview", { text });
    expect(preview.entries.map(({ state }) => state)).toEqual(["ready", "ready", "ready", "blocked"]);
    expect(JSON.stringify(preview)).not.toContain("synthetic-p2-secret");
    expect(existsSync(journal)).toBe(false);
    expect(await fromWorkbench(page, "mcp.sources.list", {})).toMatchObject({ sources: [] });
    const { sources } = await fromWorkbench<{ sources: Source[] }>(page, "mcp.sources.importCommit", {
      previewId: preview.previewId, sourcesRevision: preview.sourcesRevision,
      selections: preview.entries.slice(0, 3).map(({ entryId }) => ({ action: "create", entryId })),
    });
    expect(sources.every((source) => !source.enabled)).toBe(true);
    expect(existsSync(journal)).toBe(false);
    const local = sources[0]!;
    const { configurationFingerprint } = await fromWorkbench<{ configurationFingerprint: string }>(page, "mcp.executionApproval.preview", sourceRef(local));
    await fromWorkbench(page, "mcp.executionApproval.confirm", { ...sourceRef(local), configurationFingerprint });
    const enabled: Source[] = [];
    for (const source of sources) {
      expect(await fromWorkbench(page, "mcp.sources.check", sourceRef(source))).toMatchObject({ state: "ready", toolCount: source.namespace === "repo" ? 3 : 1 });
      const catalog = await fromWorkbench<Catalog>(page, "mcp.catalog.list", { sourceId: source.sourceId });
      await publication(page, catalog, source.sourceId, "echo", true);
      enabled.push(await fromWorkbench<Source>(page, "mcp.sources.setEnabled", { ...sourceRef(source), enabled: true }));
    }
    await call(page, "gateway.update", { capability: "vault.info", exposed: true });
    await call(page, "gateway.mcp.update", { enabled: true });
    const { token } = await call<{ token: string }>(page, "gateway.tokens.create", { name: "P2 local test" });
    const rpc = await openClient(page, token);
    const expected = ["vault_info", "repo__echo", "http_repo__echo", "sse_repo__echo"];
    expect((await rpc("tools/list")).result.tools.map(({ name }: { name: string }) => name)).toEqual(expected);
    expect((await rpc("tools/call", { name: "repo__echo", arguments: { value: "stdio" } })).result.structuredContent).toEqual({ value: "stdio" });
    expect((await rpc("tools/call", { name: "http_repo__echo", arguments: { value: "http" } })).result.structuredContent).toEqual({ transport: "streamable-http", value: "http" });
    expect((await rpc("tools/call", { name: "sse_repo__echo", arguments: { value: "fail" } })).result).toMatchObject({ isError: true, structuredContent: { transport: "sse", value: "fail" } });

    writeFileSync(definition, JSON.stringify({ names: [...names].reverse(), pageSize: 1, minLength: 1 }));
    await fromWorkbench(page, "mcp.sources.refresh", sourceRef(enabled[0]!));
    expect((await rpc("tools/list")).result.tools.find(({ name }: { name: string }) => name === "repo__echo")).toMatchObject({
      outputSchema: { properties: { value: { minLength: 1 } } },
    });
    const catalog = await fromWorkbench<Catalog>(page, "mcp.catalog.list", {});
    await publication(page, catalog, sources[1]!.sourceId, "echo", false);
    expect((await rpc("tools/list")).result.tools.map(({ name }: { name: string }) => name)).not.toContain("http_repo__echo");
    expect((await rpc("tools/call", { name: "http_repo__echo", arguments: { value: "blocked" } })).error.data.code).toBe("CAPABILITY_NOT_EXPOSED");
    expect(http.calls).toEqual([{ name: "echo", input: { value: "http" } }]);
    expect(sse.calls).toEqual([{ name: "echo", input: { value: "fail" } }]);
    expect(events(journal).filter(({ type }) => type === "call")).toMatchObject([{ name: "echo", args: { value: "stdio" } }]);
  } finally {
    await app?.close().catch(() => undefined);
    await http?.close().catch(() => undefined);
    await sse?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});

test("P3 正式来源页面添加服务、预览发布并访问真实资源和提示", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-mcp-page-e2e-"));
  const vault = path.join(sandbox, "vault");
  const journal = path.join(sandbox, "fixture.ndjson");
  const definition = path.join(sandbox, "definition.json");
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    mkdirSync(vault);
    writeFileSync(definition, JSON.stringify({ catalog: true, label: "Shared resource" }));
    app = await launch(vault);
    const page = await app.firstWindow();
    await gateway(page);
    const panel = page.getByTestId("gateway-mcp-sources");
    await panel.getByRole("button", { name: "添加服务" }).click();
    const editor = page.getByRole("dialog", { name: "添加 MCP 服务" });
    await editor.getByLabel("服务名称").fill("页面夹具");
    await editor.getByLabel("稳定命名空间").fill("catalog_page");
    await editor.getByLabel("命令", { exact: true }).fill(process.execPath);
    await editor.getByLabel("参数（JSON 数组）").fill(JSON.stringify([stdioFixture, journal, definition]));
    await editor.getByRole("button", { name: "保存配置" }).click();
    await panel.getByRole("button", { name: "查看 页面夹具" }).click();
    const detail = panel.getByTestId("mcp-source-detail");
    await expect(detail).toContainText("未启用");
    expect(existsSync(journal)).toBe(false);
    await detail.getByRole("button", { name: "核对命令并授权" }).click();
    const approval = page.getByRole("dialog", { name: "授予本机许可" });
    await expect(approval.getByRole("button", { name: "取消" })).toBeFocused();
    await approval.getByRole("button", { name: "确认", exact: true }).click();
    await detail.getByRole("button", { name: "检查连接" }).click();
    await expect(panel.getByRole("status")).toContainText("检查成功");
    const directory = panel.getByRole("table", { name: "MCP 能力目录" });
    const selectEntry = async (name: string) => {
      await directory.getByRole("button", { name: "选择开放 " + name, exact: true }).click();
      const preview = page.getByRole("dialog", { name: "预览开放变更" });
      await expect(preview).toContainText(name);
      await preview.getByRole("button", { name: "确认更新开放策略" }).click();
      await expect(preview).toBeHidden();
    };
    await selectEntry("catalog_page__echo");
    await page.getByRole("tab", { name: "Resources" }).click();
    const uri = "mcp-source://catalog_page/fixture://note/1";
    await selectEntry(uri);
    await page.getByRole("tab", { name: "Templates" }).click();
    await selectEntry("mcp-source://catalog_page/fixture://group/{folder}/{name}{?q,format}");
    await page.getByRole("tab", { name: "Prompts" }).click();
    await selectEntry("catalog_page__review");
    await detail.getByRole("button", { name: "启用来源", exact: true }).click();
    await call(page, "gateway.mcp.update", { enabled: true });
    const { token } = await call<{ token: string }>(page, "gateway.tokens.create", { name: "UI catalog" });
    const rpc = await openClient(page, token);
    expect((await rpc("tools/list")).result.tools).toContainEqual(expect.objectContaining({ name: "catalog_page__echo" }));
    expect((await rpc("tools/call", { name: "catalog_page__echo", arguments: { value: "目录工具" } })).result.structuredContent).toEqual({ value: "目录工具" });
    expect((await rpc("resources/list")).result.resources).toContainEqual(expect.objectContaining({ uri }));
    expect((await rpc("resources/read", { uri })).result.contents).toMatchObject([{ uri, text: "Shared resource" }]);
    const uriTemplate = "mcp-source://catalog_page/fixture://group/{folder}/{name}{?q,format}";
    const expanded = "mcp-source://catalog_page/fixture://group/finance/report?q=CNY&format=md";
    expect((await rpc("resources/templates/list")).result.resourceTemplates).toContainEqual(expect.objectContaining({ uriTemplate }));
    expect((await rpc("resources/read", { uri: expanded })).result.contents).toMatchObject([{ uri: expanded, text: "Shared resource" }]);
    expect((await rpc("prompts/list")).result.prompts).toContainEqual(expect.objectContaining({ name: "catalog_page__review" }));
    expect((await rpc("prompts/get", { name: "catalog_page__review", arguments: { topic: "本机夹具" } })).result.messages).toMatchObject([
      { content: { text: "本机夹具" } }, { content: { resource: { uri } } },
    ]);
  } finally {
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});

test("P7 来源详情显示上游所需的未支持客户端能力", async () => {
  const { page, close } = await openApp();
  let upstream: Awaited<ReturnType<typeof localUpstream>> | undefined;
  try {
    upstream = await localUpstream("streamable-http", { requires: "sampling" });
    await gateway(page);
    const panel = page.getByTestId("gateway-mcp-sources");
    await panel.getByRole("button", { name: "添加服务" }).click();
    const editor = page.getByRole("dialog", { name: "添加 MCP 服务" });
    await editor.getByLabel("服务名称").fill("需要 Sampling");
    await editor.getByLabel("稳定命名空间").fill("sampling_fixture");
    await editor.getByLabel("传输").selectOption("streamable-http");
    await editor.getByLabel("远端 URL").fill(upstream.url);
    await editor.getByRole("button", { name: "保存配置" }).click();
    await panel.getByRole("button", { name: "查看 需要 Sampling" }).click();
    const detail = panel.getByTestId("mcp-source-detail");
    await detail.getByRole("button", { name: "检查连接" }).click();
    await expect(detail).toContainText("上游需要 Huhu 未提供的 MCP 客户端能力（sampling）");
    await detail.getByRole("button", { name: "查看此来源的目录" }).click();
    await expect(panel.getByRole("table", { name: "MCP 能力目录" })).not.toContainText("sampling_fixture__echo");
    expect(upstream.calls).toHaveLength(0);
  } finally {
    try {
      await close();
    } finally {
      await upstream?.close();
    }
  }
});

test("桌面与获邀 Web 窄窗和大字号下显示来源、删除影响和诊断，键盘可取消并恢复焦点", async () => {
  test.setTimeout(60_000);
  const secret = "Bearer delete-preview-fixture";
  const { app, page: desktop, close } = await openApp({ HUHU_MCP_DELETE_TEST_AUTH: secret });
  let browser: Browser | undefined;
  const upstreams: Awaited<ReturnType<typeof localUpstream>>[] = [];
  let appearance: string | null | undefined;
  try {
    await engineReady(desktop);
    appearance = await desktop.evaluate(() => localStorage.getItem("huhu.appearance"));
    await call(desktop, "settings.update", { patch: { appearance: { fontSize: 18 } } });
    await desktop.reload();
    await gateway(desktop);

    const upstream = await localUpstream("streamable-http", { authorization: secret });
    upstreams.push(upstream);
    const empty = await localUpstream("streamable-http", { advertise: "none" });
    upstreams.push(empty);
    const incompatible = await localUpstream("streamable-http", { requires: "roots" });
    upstreams.push(incompatible);
    const register = (namespace: string, displayName: string, url: string, authorized = false) => call<Source>(desktop, "mcp.sources.create", {
      namespace, displayName, configuration: { transport: "streamable-http", url, headers: {}, authentication: authorized
        ? { kind: "environment", name: "HUHU_MCP_DELETE_TEST_AUTH", header: "Authorization" } : { kind: "none" } },
    });
    const target = await register("remove_source", "待删除来源", upstream.url, true);
    const other = await register("keep_source", "保留来源", upstream.url, true);
    for (const source of [target, other]) {
      expect(await call(desktop, "mcp.sources.check", sourceRef(source))).toMatchObject({ state: "ready", toolCount: 1 });
      const { catalogRevision, policyRevision } = await call<Catalog>(desktop, "mcp.catalog.list", {});
      await call(desktop, "mcp.policy.update", { expectedCatalogRevision: catalogRevision, expectedPolicyRevision: policyRevision,
        choices: [{ sourceId: source.sourceId, upstreamIdentity: "echo", selected: true }] });
      await call(desktop, "mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
    }
    await register("empty_source", "无能力来源", empty.url);
    await register("denied_source", "拒绝认证来源", upstream.url);
    await register("roots_source", "协议不兼容来源", incompatible.url);
    await call(desktop, "gateway.mcp.update", { enabled: true });
    const { token } = await call<{ token: string }>(desktop, "gateway.tokens.create", { name: "Delete preview fixture" });
    const rpc = await openClient(desktop, token);
    expect((await rpc("tools/list")).result.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "remove_source__echo" }), expect.objectContaining({ name: "keep_source__echo" }),
    ]));
    const tool = (namespace: string) => ({ name: namespace + "__echo", arguments: { value: namespace } });
    for (const source of [target, other]) {
      expect((await rpc("tools/call", tool(source.namespace))).result.structuredContent.value).toBe(source.namespace);
    }

    await call(desktop, "web.share.start", { mode: "local", port: 0 });
    const { links: [invite] } = await call<{ links: string[] }>(desktop, "web.invitations.create", {});
    browser = await chromium.launch();
    const web = await browser.newPage({ viewport: { width: 430, height: 680 } });
    await web.goto(invite!);
    await web.getByRole("button", { name: "能力网关", exact: true }).first().click();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setSize(960, 720);
      window.webContents.setZoomFactor(1.15);
    });

    for (const page of [desktop, web]) {
      const panel = page.getByTestId("gateway-mcp-sources");
      const table = panel.getByRole("table", { name: "外部 MCP 服务列表" });
      const scroll = panel.getByRole("region", { name: "滚动查看外部 MCP 服务" });
      await expect.poll(() => page.locator("html").evaluate((html) => getComputedStyle(html).getPropertyValue("--font-size").trim())).toBe("18px");
      await expect(table.getByRole("columnheader")).toHaveText(["服务", "传输与地址", "连接状态", "认证", "最近检查 / 目录"]);
      await scroll.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      const lastHeader = table.getByRole("columnheader", { name: /最近检查/ });
      await lastHeader.scrollIntoViewIfNeeded();
      await expect(lastHeader).toBeInViewport();
      await expect(panel.getByRole("button", { name: "添加服务" })).toBeEnabled();

      const detail = panel.getByTestId("mcp-source-detail");
      for (const [name, diagnostic] of [
        ["无能力来源", "检查成功 · 发现 0 个工具"],
        ["拒绝认证来源", "上游拒绝了认证"],
        ["协议不兼容来源", "上游需要 Huhu 未提供的 MCP 客户端能力（listing roots）"],
      ]) {
        await table.getByRole("button", { name: `查看 ${name}` }).click();
        const check = detail.getByRole("button", { name: "检查连接" });
        await check.scrollIntoViewIfNeeded();
        await expect(check).toBeInViewport({ ratio: 1 });
        await check.click();
        await expect(panel.getByRole("status").filter({ hasText: diagnostic })).toBeVisible();
      }

      await table.getByRole("button", { name: "查看 待删除来源" }).click();
      const trigger = detail.getByRole("button", { name: "删除", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "删除 MCP 服务" });
      const cancel = dialog.getByRole("button", { name: "取消", exact: true });
      const confirm = dialog.getByRole("button", { name: "确认删除" });
      await expect(cancel).toBeFocused();
      await expect(dialog.getByRole("list", { name: "将撤下的公开条目" }).getByRole("listitem")).toHaveText("工具 · remove_source__echo");
      await expect(dialog).toContainText("本机凭据：无绑定");
      await expect(dialog).not.toContainText(/keep_source__echo|HUHU_MCP_DELETE_TEST_AUTH|delete-preview-fixture/);
      await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await expect(confirm).toBeEnabled();
      await page.keyboard.press("Tab");
      await expect(confirm).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(table.getByRole("button", { name: "查看 待删除来源" })).toBeVisible();
    }

    const panel = web.getByTestId("gateway-mcp-sources");
    await panel.getByTestId("mcp-source-detail").getByRole("button", { name: "删除", exact: true }).click();
    await web.getByRole("dialog", { name: "删除 MCP 服务" }).getByRole("button", { name: "确认删除" }).click();
    for (const page of [desktop, web]) {
      const table = page.getByRole("table", { name: "外部 MCP 服务列表" });
      await expect(table.getByRole("button", { name: "查看 待删除来源" })).toHaveCount(0);
      await expect(table.getByRole("button", { name: "查看 保留来源" })).toBeVisible();
    }
    expect((await rpc("tools/list")).result.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "keep_source__echo" })]));
    expect((await rpc("tools/list")).result.tools).not.toContainEqual(expect.objectContaining({ name: "remove_source__echo" }));
    const received = upstream.calls.length;
    expect((await rpc("tools/call", tool(target.namespace))).error.data.code).toBe("CAPABILITY_NOT_FOUND");
    expect(upstream.calls).toHaveLength(received);
    expect((await rpc("tools/call", tool(other.namespace))).result.structuredContent.value).toBe(other.namespace);
    expect(upstream.admissions.at(-1)?.authorization).toBe(secret);
  } finally {
    try {
      await browser?.close();
      if (appearance !== undefined && !desktop.isClosed()) await desktop.evaluate((cached) => {
        if (cached === null) localStorage.removeItem("huhu.appearance");
        else localStorage.setItem("huhu.appearance", cached);
      }, appearance);
    } finally {
      try { await close(); }
      finally { await Promise.all(upstreams.map((upstream) => upstream.close())); }
    }
  }
});

test("P4 独立 Web 工作台通过正式来源页面预览、导入并读取脱敏配置", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-mcp-web-e2e-"));
  const vault = path.join(sandbox, "vault");
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  let browser: Browser | undefined;
  try {
    mkdirSync(vault);
    app = await launch(vault);
    const desktop = await app.firstWindow();
    await gateway(desktop);
    await desktop.getByRole("tab", { name: "服务端" }).click();
    const share = desktop.getByTestId("web-share-panel");
    await share.getByRole("combobox", { name: "分享范围" }).selectOption("local");
    await share.getByRole("button", { name: "启动分享" }).click();
    await share.getByRole("button", { name: "创建邀请" }).click();
    const invitation = desktop.getByRole("dialog", { name: "Web 邀请链接" });
    const link = await invitation.getByRole("textbox", { name: /^邀请链接 127.0.0.1:/ }).inputValue();
    await invitation.getByRole("button", { name: "完成" }).click();

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(link);
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    const panel = page.getByTestId("gateway-mcp-sources");
    await panel.getByRole("button", { name: "导入 JSON" }).click();
    const importer = page.getByRole("dialog", { name: "导入 MCP 配置" });
    await importer.getByLabel("mcpServers JSON").fill(JSON.stringify({ mcpServers: {
      web_demo: { command: "huhu-unused-fixture", args: ["serve"], env: { FIXTURE: "${HUHU_TEST_REFERENCE}" } },
    } }));
    await importer.getByRole("button", { name: "预览导入", exact: true }).click();
    await expect(importer.getByRole("region", { name: "导入预览" })).toContainText("web_demo");
    await importer.getByRole("button", { name: "提交所选变更" }).click();
    await panel.getByRole("button", { name: "查看 web_demo" }).click();
    await expect(panel.getByTestId("mcp-source-detail")).toContainText("未启用");
    const exported = page.waitForEvent("download");
    await panel.getByRole("button", { name: "脱敏导出" }).click();
    const downloaded = await exported;
    expect(downloaded.suggestedFilename()).toBe("mcp-sources.json");
    expect(readFileSync((await downloaded.path())!, "utf8")).toContain("HUHU_TEST_REFERENCE");
  } finally {
    await browser?.close().catch(() => undefined);
    await app?.close().catch(() => undefined);
    rmTree(sandbox);
  }
});

test("P4 桌面来源页面完成回环 OAuth 登录并注销", async () => {
  test.skip(process.env["HUHU_MCP_KEYRING_ACCEPTANCE"] !== "1", "需要可用的系统凭据宿主");
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-mcp-oauth-ui-"));
  const vault = path.join(sandbox, "vault");
  let app: Awaited<ReturnType<typeof launch>> | undefined;
  let issuer: Awaited<ReturnType<typeof loopbackOAuth>> | undefined;
  try {
    mkdirSync(vault);
    issuer = await loopbackOAuth();
    app = await launch(vault);
    const page = await app.firstWindow();
    await gateway(page);
    const panel = page.getByTestId("gateway-mcp-sources");
    await panel.getByRole("button", { name: "添加服务" }).click();
    const editor = page.getByRole("dialog", { name: "添加 MCP 服务" });
    await editor.getByLabel("服务名称").fill("回环授权");
    await editor.getByLabel("稳定命名空间").fill("oauth_page");
    await editor.getByLabel("传输").selectOption("streamable-http");
    await expect(editor.getByLabel("非秘密 header（JSON）")).toHaveValue("{}");
    await editor.getByLabel("远端 URL").fill(issuer.url);
    await editor.getByLabel("认证方式").selectOption("oauth");
    await editor.getByRole("button", { name: "保存配置" }).click();
    await expect(editor).toBeHidden();
    await panel.getByRole("button", { name: "查看 回环授权" }).click();
    const detail = panel.getByTestId("mcp-source-detail");
    await detail.getByRole("button", { name: "登录 OAuth" }).click();
    const login = page.getByRole("dialog", { name: "OAuth 登录" });
    await login.getByLabel("账号标签").fill("工作账号");
    await login.getByRole("button", { name: "开始登录" }).click();
    const link = login.getByRole("link", { name: "打开授权页" });
    await expect(link).toBeVisible();
    expect((await fetch((await link.getAttribute("href"))!)).ok).toBe(true);
    await expect(login.getByRole("status")).toHaveText("认证已完成");
    await login.getByRole("button", { name: "完成" }).click();
    await expect(detail).toContainText("已绑定 · 工作账号");
    await detail.getByRole("button", { name: "注销 OAuth" }).click();
    await expect(detail).toContainText("未绑定");
    expect(issuer.exchanges).toBe(1);
  } finally {
    await app?.close().catch(() => undefined);
    await issuer?.stop().catch(() => undefined);
    rmTree(sandbox);
  }
});
