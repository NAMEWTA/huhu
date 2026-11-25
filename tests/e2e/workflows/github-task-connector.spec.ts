import { execFile } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import type { CapabilityResult, TaskDto } from "../../../packages/contracts/src/index.js";
import type { AgentSettingsFile } from "../../../plugins/agent-cli/src/shared/settings.js";
import { startCodexResponsesFixture } from "../../../plugins/agent-cli/test/fixtures/codex-responses.js";
import { githubAuthor, githubCommentEvent, githubIssue, githubIssueEvent, githubRepository } from "../../../plugins/tasks/test/github-fixture.js";
import { withFixtureCleanup } from "../helpers/candidate-desktop.js";
import { openApp, rmTree } from "../helpers/launch.js";

const run = promisify(execFile);

function caller(page: Page) {
  return async <T>(capability: string, input: unknown = {}) => {
    const result = (await page.evaluate(
      async ([capability, input]) => {
        const endpoint = await window.huhuHost.engine();
        const response = await fetch(`${endpoint.baseUrl}/api/v1/call`, {
          method: "POST",
          headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
          body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
        });
        return response.json();
      },
      [capability, input] as const,
    )) as CapabilityResult<T>;
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  };
}

test("TW4 GitHub 回环源通过公开入口创建任务并在桌面显示讨论", async () => {
  const { page, close } = await openApp();
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    const url = new URL(request.url!, "http://127.0.0.1");
    const repository = `/repos/${githubRepository.name}`;
    if (request.headers.authorization !== "Bearer fixture-only") response.writeHead(401).end("{}");
    else if (url.pathname === repository) response.end(JSON.stringify({ id: githubRepository.id, full_name: githubRepository.name }));
    else if (url.pathname === `${repository}/events`) response.end(JSON.stringify([githubCommentEvent("20102", "回环 GitHub 讨论"), githubIssueEvent()]));
    else response.writeHead(404).end("{}");
  });
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const desktop = caller(page);
    const connector = await desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "回环 GitHub" });
    const source = await desktop<{ sourceId: string }>("tasks.github.source.create", {
      connectorId: connector.id,
      repositoryId: githubRepository.id,
      repository: githubRepository.name,
    });
    for (const capability of ["tasks.github.events.accept", "tasks.github.events.read"]) {
      await desktop("gateway.update", { capability, exposed: true });
    }
    const engine = await page.evaluate(async () => (await window.huhuHost.engine()).baseUrl);
    const { stdout } = await run(
      process.execPath,
      [
        path.resolve("scripts/github-task-connector.mjs"),
        "--source",
        source.sourceId,
        "--engine",
        engine,
        "--api",
        api,
        "--repository",
        githubRepository.name,
        "--repository-id",
        String(githubRepository.id),
        "--cursor",
        test.info().outputPath("github-cursor.json"),
      ],
      { env: { ...process.env, HUHU_CONNECTOR_ENGINE_TOKEN: connector.token, HUHU_CONNECTOR_GITHUB_TOKEN: "fixture-only" } },
    );
    const [created, comment] = JSON.parse(stdout) as { taskId: string; state: string }[];
    expect(created).toMatchObject({ taskId: expect.any(String), state: "created" });
    expect(comment).toMatchObject({ taskId: created!.taskId, state: "discussion" });
    const task = await desktop<TaskDto>("tasks.read", { id: created!.taskId });
    expect(task.origin).toMatchObject({ kind: "external", github: { sourceId: source.sourceId, issueId: githubIssue.id } });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByRole("button", { name: `打开任务 ${githubIssue.title}`, exact: true }).click();
    await expect(page.getByTestId("task-detail")).toContainText("回环 GitHub 讨论");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await close();
  }
});

test("TW5 GitHub 评论回包丢失后核实原投递且桌面只显示一次模型结果", async () => {
  test.setTimeout(120_000);
  const binary = process.env.HUHU_CODEX_DISPATCH_BIN;
  test.skip(process.platform !== "linux" || !binary, "需要 Linux 上受控派遣白名单中的固定 Codex 二进制。");
  const provider = await realpath(binary!);
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "huhu-github-result-")));
  const message = "TW5 durable fixture result";
  const responses = await startCodexResponsesFixture({ seedReply: message });
  const sender = { id: 81, login: "outbound-fixture" };
  let posted: ReturnType<typeof githubCommentEvent> | undefined;
  let posts = 0;
  let app: Awaited<ReturnType<typeof openApp>> | undefined;
  const server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    const { pathname } = new URL(request.url!, "http://127.0.0.1");
    const repository = `/repos/${githubRepository.name}`;
    const issuePath = `${repository}/issues/${githubIssue.number}`;
    if (request.headers.authorization !== "Bearer fixture-only") response.writeHead(401).end("{}");
    else if (pathname === repository) response.end(JSON.stringify({ id: githubRepository.id, full_name: githubRepository.name }));
    else if (pathname === "/user") response.end(JSON.stringify(sender));
    else if (pathname === issuePath) response.end(JSON.stringify(githubIssue));
    else if (pathname === `${repository}/events`) {
      response.end(JSON.stringify(posted ? [githubCommentEvent("20152", "合法外部新讨论", githubAuthor), posted, githubIssueEvent()] : [githubIssueEvent()]));
    } else if (pathname === `${issuePath}/comments` && request.method === "POST") {
      posts++;
      let raw = "";
      for await (const chunk of request) raw += String(chunk);
      posted = githubCommentEvent("20150", (JSON.parse(raw) as { body: string }).body, sender);
      response.destroy();
    } else if (pathname === `${issuePath}/comments`) {
      response.end(JSON.stringify(posted ? [posted.payload.comment] : []));
    } else response.writeHead(404).end("{}");
  });
  try {
    await writeFile(path.join(home, "config.toml"), responses.config, { mode: 0o600 });
    app = await openApp({ HUHU_CODEX_DISPATCH_HOME: home, HUHU_CODEX_DISPATCH_BIN: provider });
    const { page } = app;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const desktop = caller(page);
    const connector = await desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "回环 GitHub 投递" });
    const source = await desktop<{ sourceId: string }>("tasks.github.source.create", {
      connectorId: connector.id,
      repositoryId: githubRepository.id,
      repository: githubRepository.name,
    });
    for (const capability of ["events.accept", "events.read", "deliveries.claim", "deliveries.confirm", "deliveries.read"]) {
      await desktop("gateway.update", { capability: `tasks.github.${capability}`, exposed: true });
    }
    const common = [
      "--source",
      source.sourceId,
      "--engine",
      await page.evaluate(async () => (await window.huhuHost.engine()).baseUrl),
      "--api",
      `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      "--repository",
      githubRepository.name,
      "--repository-id",
      String(githubRepository.id),
    ];
    const cli = async <T>(script: string, args: string[]) => {
      const { stdout } = await run(process.execPath, [path.resolve("scripts", script), ...common, ...args], {
        env: { ...process.env, HUHU_CONNECTOR_ENGINE_TOKEN: connector.token, HUHU_CONNECTOR_GITHUB_TOKEN: "fixture-only" },
      });
      return JSON.parse(stdout) as T;
    };
    const scan = () => cli<{ taskId: string; state: string }[]>("github-task-connector.mjs", ["--cursor", test.info().outputPath("github-cursor.json")]);
    const [created] = await scan();
    expect(created).toMatchObject({ state: "created" });
    const id = created!.taskId;
    await desktop("tasks.github.deliveries.allow", { sourceId: source.sourceId, issueId: githubIssue.id, actorId: sender.id });
    const { settings } = await desktop<{ settings: AgentSettingsFile }>("agent.settings.get");
    await desktop("agent.settings.update", {
      ...settings,
      expectedRevision: settings.revision,
      agents: { ...settings.agents, codex: { ...settings.agents["codex"], command: provider, env: { CODEX_HOME: home } } },
    });
    const [space] = await desktop<{ id: string }[]>("agent.spaces.list");
    const original = await desktop<TaskDto>("tasks.read", { id });
    await desktop("tasks.update", { id, expectedVersion: original.version, patch: { type: "agent", execution: { spaceId: space!.id, provider: "codex" } } });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByRole("button", { name: `打开任务 ${githubIssue.title}`, exact: true }).click();
    const detail = page.getByTestId("task-detail");
    await detail.getByRole("button", { name: "立即派遣", exact: true }).click();
    const getRuns = () => desktop<{ result?: { receiptId: string; delivery: string } }[]>("tasks.runs", { id });
    await expect.poll(getRuns, { timeout: 45_000 }).toMatchObject([{ result: { receiptId: expect.any(String), delivery: "delivered" } }]);
    const [{ result }] = (await getRuns()) as [{ result: { receiptId: string } }];
    const deliver = () => cli<{ deliveryId: string; state: string }>("github-task-delivery.mjs", ["--task", id, "--receipt", result.receiptId, "--issue-id", String(githubIssue.id), "--issue-number", String(githubIssue.number)]);
    const acknowledged = await deliver();
    expect(acknowledged).toMatchObject({ state: "accepted" });
    expect(await scan()).toMatchObject([
      { taskId: id, state: "echo" },
      { taskId: id, state: "discussion" },
    ]);
    expect(await deliver()).toEqual(acknowledged);
    expect(posts).toBe(1);
    expect(responses.requests).toHaveLength(1);
    await expect(detail).toContainText("合法外部新讨论");
    const task = await desktop<TaskDto>("tasks.read", { id });
    expect(task.comments.filter(({ event }) => event === "result")).toMatchObject([{ body: expect.stringContaining(message) }]);
    expect(task.comments.filter(({ event }) => event === "github-comment")).toHaveLength(1);
  } finally {
    await withFixtureCleanup(async () => {}, [
      ["关闭桌面", () => app?.close()],
      ["停止 GitHub 回环夹具", () => new Promise<void>((resolve) => server.close(() => resolve()))],
      ["停止模型回环夹具", () => responses.close()],
      ["清理独立模型资料", () => rmTree(home)],
    ]);
  }
});
