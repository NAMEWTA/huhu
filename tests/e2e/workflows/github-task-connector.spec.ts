import { execFile } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import type { CapabilityResult, PlanOccurrence, TaskDto } from "../../../packages/contracts/src/index.js";
import type { TaskQuestionView } from "../../../plugins/tasks/src/engine/receipt-inbox.js";
import type { z } from "zod";
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

test("TW5 GitHub 评论回包丢失后从待核实结果打开原 Issue 并核实原投递", () => githubDeliveryJourney("list"));
test("TW5 GitHub 回声先于核实请求确认原投递，另一作者复制标记仍受理", () => githubDeliveryJourney("echo"));
test("TW5 GitHub POST 成功后只保留一个原评论和一个运行", () => githubDeliveryJourney("success"));
test("同一 GitHub 原事件按计划到期、获准 actor 回答后回传原 Issue", () => githubDeliveryJourney("scheduled"));

async function githubDeliveryJourney(mode: "list" | "echo" | "success" | "scheduled") {
  test.setTimeout(120_000);
  const binary = process.env.HUHU_CODEX_DISPATCH_BIN;
  test.skip(process.platform !== "linux" || !binary, "需要 Linux 上受控派遣白名单中的固定 Codex 二进制。");
  const provider = await realpath(binary!);
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "huhu-github-result-")));
  const message = "TW5 durable fixture result";
  const scheduled = mode === "scheduled";
  const responses = await startCodexResponsesFixture(scheduled ? { result: message } : { seedReply: message });
  const sender = { id: 81, login: "outbound-fixture" };
  let posted: ReturnType<typeof githubCommentEvent> | undefined;
  let posts = 0;
  let lists = 0;
  let visibleComment = false;
  let visibleEcho = false;
  let inbound: ReturnType<typeof githubCommentEvent>[] = [];
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
      const echo = posted && visibleEcho ? [githubCommentEvent("20152", posted.payload.comment.body, githubAuthor), posted] : [];
      response.end(JSON.stringify([...echo, ...inbound.toReversed(), githubIssueEvent()]));
    } else if (pathname === `${issuePath}/comments` && request.method === "POST") {
      posts++;
      let raw = "";
      for await (const chunk of request) raw += String(chunk);
      posted = githubCommentEvent("20150", (JSON.parse(raw) as { body: string }).body, sender);
      if (mode === "list" || mode === "echo") response.destroy();
      else response.writeHead(201).end(JSON.stringify(posted.payload.comment));
    } else if (pathname === `${issuePath}/comments`) {
      lists++;
      response.end(JSON.stringify(posted && visibleComment ? [posted.payload.comment] : []));
    } else response.writeHead(404).end("{}");
  });
  try {
    await writeFile(path.join(home, "config.toml"), responses.config, { mode: 0o600 });
    app = await openApp({ HUHU_CODEX_DISPATCH_HOME: home, HUHU_CODEX_DISPATCH_BIN: provider });
    const { app: electronApp, page } = app;
    await electronApp.evaluate(({ BrowserWindow, dialog, shell }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(960, 600);
      const opened: string[] = [];
      Reflect.set(globalThis, "githubDeliveryOpened", opened);
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      shell.openExternal = async (url) => { opened.push(url); };
    });
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const desktop = caller(page);
    const connector = await desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "回环 GitHub 投递" });
    const source = await desktop<{ sourceId: string }>("tasks.github.source.create", {
      connectorId: connector.id,
      repositoryId: githubRepository.id,
      repository: githubRepository.name,
      ...(scheduled && { replyActorIds: [githubAuthor.id] }),
    });
    for (const capability of ["events.accept", "events.read", "deliveries.claim", "deliveries.confirm", "deliveries.read", "deliveries.pendingVerification"]) {
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
    const cli = async <T>(script: string, args: string[], exitCode = 0) => {
      try {
        const { stdout } = await run(process.execPath, [path.resolve("scripts", script), ...common, ...args], {
          env: { ...process.env, HUHU_CONNECTOR_ENGINE_TOKEN: connector.token, HUHU_CONNECTOR_GITHUB_TOKEN: "fixture-only" },
        });
        expect(exitCode).toBe(0);
        return JSON.parse(stdout) as T;
      } catch (error) {
        if (exitCode === 0 || (error as { code?: number }).code !== exitCode) throw error;
        return JSON.parse((error as { stdout: string }).stdout) as T;
      }
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
    const getRuns = () => desktop<{ runId: string; result?: { receiptId: string; delivery: string } }[]>("tasks.runs", { id });
    if (scheduled) {
      const scheduledFor = new Date(Date.now() + 6_000).toISOString();
      const followUp = await desktop<{ planId: string; followUpId: string }>("automations.followUps.schedule", { taskId: id, scheduledFor, expectedRevision: null });
      expect(await getRuns()).toEqual([]);
      expect(responses.requests).toHaveLength(0);
      const questions = () => desktop<z.infer<typeof TaskQuestionView>[]>("tasks.questions.list", { taskId: id });
      await expect.poll(questions, { timeout: 45_000 }).toMatchObject([{ status: "awaiting", mode: "native_deferred" }]);
      const [question] = await questions();
      const { runId, sessionId, requestId, requestVersion } = question!;
      const questionRef = { taskId: id, runId, sessionId, requestId, requestVersion };
      const accepted = await desktop<{ followUpId: string; runId: string }>("automations.followUps.get", { taskId: id });
      expect(accepted).toMatchObject({ followUpId: followUp.followUpId, runId, state: "accepted", scheduledFor });
      const readOccurrence = (occurrenceId: string) => desktop<PlanOccurrence>("automations.plans.readOccurrence", { occurrenceId });
      expect(await readOccurrence(followUp.followUpId)).toMatchObject({
        plan: { planId: followUp.planId }, timing: { trigger: "scheduled", scheduledFor },
        effects: [{ effectId: runId, kind: "task-run", target: { kind: "task", id }, receiptId: runId }],
      });
      await desktop("tasks.github.question.allow", { ...questionRef, sourceId: source.sourceId, issueId: githubIssue.id });
      const answer = `/huhu answer ${runId} ${sessionId} ${requestId} ${requestVersion}\nCircle`;
      inbound = [githubCommentEvent("20120", answer, { id: 88, login: "not-allowed" })];
      expect(await scan()).toMatchObject([{ taskId: id, state: "reply-denied" }]);
      expect(await questions()).toMatchObject([{ requestId, status: "awaiting" }]);
      expect(responses.requests).toHaveLength(1);
      inbound.push(githubCommentEvent("20121", answer));
      expect(await scan()).toMatchObject([{ taskId: id, state: "reply-accepted" }]);
      await expect.poll(getRuns, { timeout: 45_000 }).toMatchObject([{ runId, result: { delivery: "delivered" } }]);
      inbound.push(githubCommentEvent("20122", answer));
      expect(await scan()).toMatchObject([{ taskId: id, state: "reply-rejected" }]);
      expect((await desktop<TaskDto>("tasks.read", { id })).comments.filter(({ event }) => event === "answer")).toMatchObject([
        { run: runId, ask: requestId, author: "GitHub @issue-author", body: "Circle" },
      ]);
      expect(responses.requests[1]?.input).toContainEqual(expect.objectContaining({ call_id: responses.callId, output: expect.stringContaining("Circle") }));
    } else {
      await detail.getByRole("button", { name: "立即派遣", exact: true }).click();
    }
    await expect.poll(getRuns, { timeout: 45_000 }).toMatchObject([{ result: { receiptId: expect.any(String), delivery: "delivered" } }]);
    const [{ result }] = (await getRuns()) as [{ result: { receiptId: string } }];
    const deliver = (exitCode = 0) => cli<{ deliveryId: string; state: string }>("github-task-delivery.mjs", ["--task", id, "--receipt", result.receiptId, "--issue-id", String(githubIssue.id), "--issue-number", String(githubIssue.number)], exitCode);
    const lost = mode === "list" || mode === "echo";
    const originalDelivery = await deliver(lost ? 2 : 0);
    expect(originalDelivery).toMatchObject({ state: lost ? "unknown" : "accepted" });
    expect(posts).toBe(1);
    expect(lists).toBe(Number(lost));
    const key = { sourceId: source.sourceId, issueId: githubIssue.id, taskId: id, receiptId: result.receiptId };
    const readDelivery = () => desktop("tasks.github.deliveries.read", key);
    const runCard = detail.getByTestId("managed-task-run");
    await runCard.getByRole("button", { name: "展开结果", exact: true }).click();
    if (mode === "echo") {
      await expect(runCard.getByRole("button", { name: "核实原投递" })).toBeVisible();
      visibleEcho = true;
      expect(await scan()).toMatchObject([
        { taskId: id, state: "echo" },
        { taskId: id, state: "discussion" },
      ]);
      expect(lists).toBe(1);
      await expect(runCard.getByRole("button", { name: "核实原投递" })).toHaveCount(0);
    }
    if (mode === "list") {
      await expect(runCard.getByText("GitHub 投递待核实", { exact: true })).toBeVisible();
      const issue = runCard.getByRole("link", { name: "查看原 Issue", exact: true });
      await expect(issue).toHaveAttribute("href", githubIssue.html_url);
      await issue.click();
      await expect(issue).toBeFocused();
      await expect.poll(() => electronApp.evaluate(() => Reflect.get(globalThis, "githubDeliveryOpened"))).toEqual([githubIssue.html_url]);
      expect(await runCard.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const verify = runCard.getByRole("button", { name: "核实原投递" });
      await verify.click();
      await expect(verify).toBeFocused();
      await expect(runCard.getByText("等待已绑定的 GitHub 连接器核实")).toBeVisible();
      expect(await scan()).toEqual([]);
      await expect(runCard.getByText("未找到可确认的原评论，GitHub 投递仍待核实")).toBeVisible();
      expect(await readDelivery()).toMatchObject({ ...key, deliveryId: originalDelivery.deliveryId, state: "unknown" });
      expect(posts).toBe(1);
      expect(lists).toBe(2);
      visibleComment = true;
      await verify.press("Enter");
      await expect(runCard.getByText("等待已绑定的 GitHub 连接器核实")).toBeVisible();
      expect(await scan()).toEqual([]);
      await expect(runCard.getByText("GitHub 已接收评论")).toBeVisible();
      await expect(runCard.getByRole("link", { name: "查看原评论", exact: true })).toHaveAttribute("href", posted!.payload.comment.html_url);
      expect(await readDelivery()).toMatchObject({ ...key, deliveryId: originalDelivery.deliveryId, state: "accepted" });
      expect(lists).toBe(3);
    }
    await expect(runCard.getByText("GitHub 已接收评论")).toBeVisible();
    await expect(runCard.getByRole("link", { name: "查看原评论", exact: true })).toHaveAttribute("href", posted!.payload.comment.html_url);
    expect(await readDelivery()).toMatchObject({ ...key, deliveryId: originalDelivery.deliveryId, state: "accepted" });
    expect(await deliver()).toMatchObject({ deliveryId: originalDelivery.deliveryId, state: "accepted" });
    expect(await getRuns()).toMatchObject([{ result: { receiptId: result.receiptId } }]);
    expect(posts).toBe(1);
    expect(responses.requests).toHaveLength(scheduled ? 2 : 1);
    const task = await desktop<TaskDto>("tasks.read", { id });
    expect(task.origin).toMatchObject({ kind: "external", github: { sourceId: source.sourceId, issueId: githubIssue.id, eventId: "20101" } });
    expect(task.comments.filter(({ event }) => event === "result")).toMatchObject([{ body: expect.stringContaining(message) }]);
    expect(task.comments.filter(({ event }) => event === "github-comment")).toMatchObject(mode === "echo" ? [
      { author: "GitHub @issue-author", body: posted!.payload.comment.body },
    ] : []);
  } finally {
    await withFixtureCleanup(async () => {}, [
      ["关闭桌面", () => app?.close()],
      ["停止 GitHub 回环夹具", () => new Promise<void>((resolve) => server.close(() => resolve()))],
      ["停止模型回环夹具", () => responses.close()],
      ["清理独立模型资料", () => rmTree(home)],
    ]);
  }
}
