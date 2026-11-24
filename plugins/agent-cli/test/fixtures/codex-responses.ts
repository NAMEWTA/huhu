import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const toolName = "request_user_input";
const callId = "call_fixture_choice";
const question = {
  id: "shape",
  header: "Shape",
  question: "Choose a shape.",
  options: [
    { label: "Circle", description: "Round" },
    { label: "Square", description: "Four corners" },
  ],
};
export async function startCodexResponsesFixture({ seedReply, seedReplies = seedReply === undefined ? [] : [seedReply], result = "You chose Circle.", failedTurn, workspaceCommand }: {
  seedReply?: string; seedReplies?: readonly string[]; result?: string; failedTurn?: string; workspaceCommand?: { command: string; cwd: string };
} = {}) {
  const requests: { path: string | undefined; tools: { name?: string }[]; input: { type?: string; call_id?: string; output?: unknown }[] }[] = [];
  const questionRequest = seedReplies.length + 1;
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const { tools, input } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as (typeof requests)[number];
      requests.push({ path: req.url, tools, input });
      if (req.method !== "POST" || req.url !== "/v1/responses" || requests.length > questionRequest + 1) {
        res.writeHead(400).end();
        return;
      }
      if (failedTurn && requests.length === questionRequest) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { type: "invalid_request_error", message: failedTurn } }));
        return;
      }
      const ask = requests.length === questionRequest;
      const reply = seedReplies[requests.length - 1] ?? result;
      const shell = workspaceCommand && tools.find(({ name }) => name === "exec_command" || name === "shell_command")?.name;
      if (ask && workspaceCommand && !shell) throw new Error("App Server did not offer the approved shell tool");
      const command = workspaceCommand && shell && (shell === "exec_command" ? { cmd: workspaceCommand.command, workdir: workspaceCommand.cwd } : { command: workspaceCommand.command, workdir: workspaceCommand.cwd });
      const item = ask
        ? { id: "fc_fixture", type: "function_call", status: "completed", call_id: callId, name: shell ?? toolName, arguments: JSON.stringify(command || { questions: [question] }) }
        : { id: "msg_fixture_" + requests.length, type: "message", status: "completed", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: reply, annotations: [] }] };
      // Reuse the Responses lifecycle from deepseek-harness's subagent-codex fixture.
      const response = { id: "resp_fixture_" + requests.length, object: "response", output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
      const events = [
        { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
        { type: "response.output_item.added", output_index: 0, item: ask ? { ...item, arguments: "", status: "in_progress" } : { ...item, content: [], status: "in_progress" } },
        ...(ask ? [] : [{ type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: reply }]),
        { type: "response.output_item.done", output_index: 0, item },
        { type: "response.completed", response: { ...response, status: "completed" } },
      ];
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end();
    } catch {
      res.destroy();
    }
  });
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  return {
    config: `model = "gpt-5.4"
model_provider = "fixture"
check_for_update_on_startup = false
[features]
plugins = false
remote_plugin = false
skill_mcp_dependency_install = false
api_key_model_discovery = false
[analytics]
enabled = false
[feedback]
enabled = false
[model_providers.fixture]
name = "Isolated Responses fixture"
base_url = "${baseUrl}"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 0
stream_max_retries = 0
`,
    requests,
    result,
    toolName,
    callId,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
