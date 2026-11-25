import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import type { CapabilityResult, TaskDto } from "../../../packages/contracts/src/index.js";
import { githubCommentEvent, githubIssue, githubIssueEvent, githubRepository } from "../../../plugins/tasks/test/github-fixture.js";
import { openApp } from "../helpers/launch.js";

const run = promisify(execFile);

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
    const desktop = async <T>(capability: string, input: unknown) => {
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
