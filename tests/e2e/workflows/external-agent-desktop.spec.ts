import { expect, test as base, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import type { CapabilityResult, TaskComment, TaskDto } from "../../../packages/contracts/src/index.js";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { startCodexResponsesFixture } from "../../../plugins/agent-cli/test/fixtures/codex-responses.js";
import type { DispatchInput, DispatchReceipt, TaskDispatchView, TaskRunSummary } from "../../../plugins/tasks/src/engine/dispatch-store.js";
import type { TaskReplyView } from "../../../plugins/tasks/src/engine/native-replies.js";
import type { TaskQuestionView } from "../../../plugins/tasks/src/engine/receipt-inbox.js";
import { withFixtureCleanup } from "../helpers/candidate-desktop.js";
import { disposeCandidate } from "../helpers/candidate-package.js";
import { openExternalAgentDesktop } from "../helpers/external-agent-desktop.js";
import { call } from "../knowledge/session-slow-bridge.js";

type Desktop = Awaited<ReturnType<typeof openExternalAgentDesktop>>;
type Responses = Awaited<ReturnType<typeof startCodexResponsesFixture>>;
type Tool = <T>(capability: string, input: object, intentKey?: string) => Promise<T>;
type Question = ReturnType<typeof TaskQuestionView.parse>;
type Reply = ReturnType<typeof TaskReplyView.parse>;

const exec = promisify(execFile);
const test = base.extend<{ openFixture: (result: string) => Promise<{ desktop: Desktop; responses: Responses }> }>({
  openFixture: [
    async ({ browserName }, use) => {
      void browserName;
      let responsesLaunch: Promise<Responses> | undefined;
      let desktopLaunch: Promise<Desktop> | undefined;
      let closing = false;
      await withFixtureCleanup(
        () =>
          use(async (result) => {
            responsesLaunch = startCodexResponsesFixture({ result });
            const responses = await responsesLaunch;
            if (closing) throw new Error("候选桌面夹具已开始清理");
            desktopLaunch = openExternalAgentDesktop(responses.config);
            return { responses, desktop: await desktopLaunch };
          }),
        [
          [
            "关闭候选桌面并回收夹具 Core",
            async () => {
              closing = true;
              await (await desktopLaunch?.catch(() => undefined))?.close();
            },
          ],
          ["关闭回环 Responses 夹具", async () => (await responsesLaunch?.catch(() => undefined))?.close()],
        ],
      );
    },
    { timeout: 120_000 },
  ],
});

test.skip(process.env["HUHU_EXTERNAL_AGENT_DESKTOP_ACCEPTANCE"] !== "1", "需要隔离的 Linux x64 候选包与锁定原生 Codex");
test.use({ trace: "off", screenshot: "off", video: "off" });
test.afterAll(disposeCandidate);

function cliTool(desktop: Desktop): Tool {
  return async <T>(capability: string, input: object, intentKey?: string) => {
    const args = ["call", capability, "--vault", desktop.vault, "--json", "--input-json", JSON.stringify(input)];
    if (intentKey) args.push("--intent-key", intentKey);
    const { stdout } = await exec(path.join(desktop.resources, "bin", "huhu"), args, { env: desktop.env, timeout: 20_000 });
    const result = JSON.parse(stdout) as CapabilityResult<T>;
    if (!result.ok) throw new Error(`${capability}：${result.error.code} ${result.error.message}`);
    return result.data;
  };
}

async function mcpTool({ page, baseUrl }: Desktop): Promise<Tool> {
  await call(page, "gateway.mcp.update", { enabled: true, transport: "http" });
  const { token } = await call<{ token: string }>(page, "gateway.tokens.create", { name: "独立外部 Agent 同包验收" });
  const url = `${baseUrl}/mcp`;
  const session = await openMcpSession(url, token);
  return async <T>(capability: string, input: object, intentKey?: string) => {
    const request = mcpRpc("tools/call", { name: capability.replaceAll(".", "_"), arguments: input, ...(intentKey && { _meta: { "huhu.dev/intent-key": intentKey } }) });
    const response = await mcpRequest(url, token, request, session, { signal: AbortSignal.timeout(20_000) });
    expect(response.status).toBe(200);
    const envelope = (await response.json()) as { id?: string; result?: { isError?: boolean; content: { text: string }[]; structuredContent?: { data: T } } };
    expect(envelope.id).toBe(request.id);
    if (envelope.result?.isError) throw new Error(`${capability}：${envelope.result.content[0]?.text}`);
    if (!envelope.result?.structuredContent) throw new Error(`${capability} 缺少 MCP 结构化结果`);
    return envelope.result.structuredContent.data;
  };
}

async function openTask(page: Page, title: string) {
  await page.getByRole("button", { name: "任务", exact: true }).first().click();
  await page.getByRole("button", { name: /^全部任务/ }).click();
  await page.getByTestId("task-views").getByRole("tab", { name: "列表" }).click();
  await page.getByRole("button", { name: `打开任务 ${title}`, exact: true }).click();
  return page.getByTestId("task-detail");
}

for (const [entry, caller] of [
  ["CLI-only", "cli"],
  ["HTTP MCP-only", "mcp"],
] as const) {
  test(`${entry} 同包外部 Agent 任务派遣与原会话问答，桌面定位唯一结果`, async ({ openFixture }, testInfo) => {
    test.setTimeout(240_000);
    const marker = `EXTERNAL-${caller.toUpperCase()}-${randomUUID()}`;
    const { desktop, responses } = await openFixture(`${marker} You chose Circle.`);
    const { page } = desktop;
    const [space] = await call<{ id: string }[]>(page, "agent.spaces.list", {});
    if (!space) throw new Error("候选 Vault 缺少默认 Agent Space");
    const capabilities = ["tasks.create", "tasks.agent.create", "tasks.update", "tasks.read", "tasks.comments.add", "tasks.dispatch", "tasks.dispatch.list", "tasks.questions.list", "tasks.reply", "tasks.reply.read", "tasks.runs"];
    for (const capability of capabilities) await call(page, "gateway.update", { capability, exposed: true });
    const tool = caller === "cli" ? cliTool(desktop) : await mcpTool(desktop);

    const execution = { spaceId: space.id, provider: "codex", target: { mode: "new" } };
    const origin = { kind: "external", caller: caller === "mcp" ? "http" : caller };
    const draft = { title: `${entry} 原任务`, body: "Original fixture input.", type: "agent", execution };
    const task = await tool<TaskDto>("tasks.create", draft, randomUUID());
    expect(task).toMatchObject({ title: draft.title, type: "agent", origin, execution });
    const patch = { title: `${draft.title} 已修改`, body: `Use the fixture shape question. ${marker}` };
    const updated = await tool<TaskDto>("tasks.update", { id: task.id, expectedVersion: task.version, baseEditHash: task.editHash, patch });
    expect(updated).toMatchObject({ id: task.id, origin, title: patch.title, inputRevision: task.inputRevision + 1 });
    expect(updated.version).not.toBe(task.version);
    expect(updated.inputHash).not.toBe(task.inputHash);
    const readTask = () => tool<TaskDto>("tasks.read", { id: task.id });
    expect(await readTask()).toMatchObject({ ...patch, id: task.id, origin, execution, version: updated.version });

    const discussion = `普通讨论 ${randomUUID()}`;
    const forged = { id: "forged-result", source: "agent", author: "伪造作者", event: "result", run: randomUUID(), session: randomUUID(), ask: randomUUID() };
    const added = await tool<{ added: boolean; comment: TaskComment }>("tasks.comments.add", { taskId: task.id, body: discussion, ...forged }, randomUUID());
    expect(added).toMatchObject({ added: true, comment: { body: discussion, source: "external", author: origin.caller } });
    expect(added.comment.id).not.toBe(forged.id);
    for (const field of ["event", "run", "session", "ask"]) expect(added.comment).not.toHaveProperty(field);
    const commented = await readTask();
    expect(commented).toMatchObject({ status: updated.status, inputRevision: updated.inputRevision, inputHash: updated.inputHash, comments: [added.comment] });
    expect(await tool("tasks.runs", { id: task.id })).toEqual([]);

    const dispatch: DispatchInput = { taskId: task.id, dispatchId: randomUUID(), expectedVersion: commented.version, inputRevision: commented.inputRevision, inputHash: commented.inputHash };
    const sent = await tool<DispatchReceipt>("tasks.dispatch", dispatch);
    const { runId, eventId } = sent;
    const dispatchIdentity = { taskId: task.id, dispatchId: dispatch.dispatchId, runId, eventId, attempt: 1 };
    expect(sent).toMatchObject({ ...dispatchIdentity, state: "pending" });
    const questions = () => tool<Question[]>("tasks.questions.list", { taskId: task.id });
    await expect.poll(questions, { timeout: 65_000 }).toMatchObject([{ runId, status: "awaiting", mode: "native_deferred", text: "Choose a shape.", options: ["Circle", "Square"] }]);
    const [question] = await questions();
    if (!question) throw new Error("原任务缺少本轮原生问题");
    const { requestId, requestVersion, sessionId } = question;
    const listDispatches = () => tool<TaskDispatchView[]>("tasks.dispatch.list", { taskId: task.id });
    const binding = { ...dispatchIdentity, session: { id: sessionId, spaceId: space.id } };
    await expect.poll(listDispatches).toMatchObject([binding]);
    const core = await desktop.inspectCore();
    expect(core).toBeDefined();
    expect(responses.requests).toHaveLength(1);
    expect(responses.requests[0]!.tools).toContainEqual(expect.objectContaining({ name: responses.toolName }));
    expect(JSON.stringify(responses.requests[0]!.input)).toContain(patch.body);
    expect(JSON.stringify(responses.requests[0]!.input)).not.toContain(discussion);

    const reply = { taskId: task.id, runId, sessionId, requestId, requestVersion, replyId: randomUUID() };
    expect(await tool("tasks.reply", { ...reply, answer: "Circle" })).toMatchObject(reply);
    await expect.poll(() => tool<Reply>("tasks.reply.read", reply), { timeout: 40_000 }).toMatchObject({ ...reply, status: "accepted" });

    const results = async () => (await readTask()).comments.filter(({ event }) => event === "result");
    const expectedResult = { id: expect.any(String), session: sessionId, run: runId, body: responses.result };
    await expect.poll(results, { timeout: 45_000 }).toMatchObject([expectedResult]);
    const [result] = await results();
    if (!result) throw new Error("原任务缺少本轮结果");
    const listRuns = () => tool<TaskRunSummary[]>("tasks.runs", { id: task.id });
    const finished = [{ id: runId, state: "succeeded", result: { kind: "result", delivery: "delivered" } }];
    await expect.poll(listRuns, { timeout: 20_000 }).toMatchObject(finished);
    await expect.poll(questions).toMatchObject([{ runId, sessionId, requestId, requestVersion, status: "closed" }]);
    expect(await tool("tasks.dispatch", dispatch)).toMatchObject(dispatchIdentity);

    const detail = await openTask(page, patch.title);
    await expect(detail.getByTestId("task-timeline").locator(`[data-comment-id="${added.comment.id}"]`)).toContainText(discussion);
    const timelineResult = detail.getByTestId("task-timeline").locator(`[data-comment-id="${result.id}"]`);
    await expect(timelineResult).toHaveCount(1);
    await expect(timelineResult).toContainText(responses.result);
    const run = detail.getByTestId("managed-task-run");
    await expect(run).toHaveCount(1);
    await expect(run).toHaveAttribute("data-run-id", runId);
    await run.getByRole("button", { name: "展开结果", exact: true }).click();
    await expect(run.getByTestId("managed-run-result")).toHaveText(responses.result);

    const terminalUrl = new URL(`/ws/terminal/${encodeURIComponent(sessionId)}`, desktop.baseUrl);
    terminalUrl.protocol = "ws:";
    let replayBytes = 0;
    const collectReplay = (socket: import("@playwright/test").WebSocket) => {
      const opened = new URL(socket.url());
      if (opened.origin === terminalUrl.origin && opened.pathname === terminalUrl.pathname) {
        socket.on("framereceived", ({ payload }) => {
          if (Buffer.isBuffer(payload)) replayBytes += payload.length;
        });
      }
    };
    page.on("websocket", collectReplay);
    await Promise.all([
      page.waitForEvent("websocket", {
        predicate: (socket) => {
          const opened = new URL(socket.url());
          return opened.origin === terminalUrl.origin && opened.pathname === terminalUrl.pathname;
        },
        timeout: 20_000,
      }),
      run.getByRole("button", { name: "定位原会话", exact: true }).click(),
    ]);
    const terminal = page.getByTestId("workspace-session-preview").getByTestId("terminal-view");
    await expect(terminal).toBeVisible();
    await expect(terminal).toHaveAttribute("data-state", "open");
    await expect.poll(() => replayBytes, { timeout: 20_000 }).toBeGreaterThan(0);
    page.off("websocket", collectReplay);
    expect(await desktop.inspectCore()).toEqual(core);
    expect(await listDispatches()).toMatchObject([binding]);
    expect(await listRuns()).toMatchObject(finished);
    expect(await results()).toEqual([result]);
    expect(responses.requests.map(({ path: url }) => url)).toEqual(["/v1/responses", "/v1/responses"]);
    expect(responses.requests[1]!.input.filter(({ type, call_id }) => type === "function_call_output" && call_id === responses.callId)).toMatchObject([{ output: expect.stringContaining("Circle") }]);
    await testInfo.attach("external-agent-original-session", {
      contentType: "application/json",
      body: JSON.stringify({ entry, vaultId: desktop.vaultId, core, ...dispatchIdentity, sessionId, requestId, requestVersion, replyId: reply.replyId, resultId: result.id, terminalPath: terminalUrl.pathname, replayBytes }),
    });
  });
}
