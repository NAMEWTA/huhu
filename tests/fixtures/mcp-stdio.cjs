const { appendFileSync, readFileSync } = require("node:fs");
const { createInterface } = require("node:readline");
const [journal, definition] = process.argv.slice(2);
const config = () => definition ? JSON.parse(readFileSync(definition, "utf8")) : {};
const resourceUri = "fixture://note/1";
const write = (event) => appendFileSync(journal, JSON.stringify(event) + "\n");
const input = createInterface({ input: process.stdin });
write({ type: "start", pid: process.pid });
input.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
  if (request.method === "initialize") {
    reply({
      protocolVersion: "2025-11-25",
      capabilities: { tools: { listChanged: true }, ...(config().catalog && { resources: { listChanged: true }, prompts: { listChanged: true } }) },
      serverInfo: { name: "local-fixture", version: "1" },
    });
  } else if (request.method === "tools/list") {
    const settings = config();
    const names = settings.names ?? ["echo"];
    const page = Number(request.params?.cursor ?? 0);
    const size = settings.pageSize ?? names.length;
    const next = (page + 1) * size < names.length ? String(settings.repeatCursor ? 1 : page + 1) : undefined;
    reply({
      tools: names.slice(page * size, (page + 1) * size).map((name) => ({
        name, description: settings.description ?? "Echo fixture", inputSchema: { type: "object", properties: { value: { type: "string" } } },
        outputSchema: { type: "object", required: ["value"], properties: { value: { type: "string", ...(settings.minLength && { minLength: settings.minLength }) } } },
        annotations: { readOnlyHint: true },
      })),
      ...(next !== undefined && { nextCursor: next }),
    });
  } else if (request.method === "tools/call") {
    const { name, arguments: args } = request.params;
    write({ type: "call", name, args, keys: Object.keys(request.params).sort() });
    reply({
      content: [{ type: "text", text: args.value }, { type: "resource_link", name: "Fixture", uri: "fixture://note/1" }],
      structuredContent: { value: args.value },
      ...(args.value === "fixture-error" && { isError: true }),
    });
  } else if (request.method === "resources/list") {
    reply({ resources: [{ uri: resourceUri, name: "同名资源", mimeType: "text/plain" }] });
  } else if (request.method === "resources/templates/list") {
    const templates = ["fixture://note/{id}", "fixture://group/{folder}/{name}{?q,format}", "fixture://overlap/{name}", "fixture://overlap/{id}"];
    reply({ resourceTemplates: templates.map((uriTemplate) => ({ uriTemplate, name: uriTemplate })) });
  } else if (request.method === "resources/read") {
    const uri = request.params.uri;
    write({ type: "read", uri });
    reply({ contents: [{ uri, text: config().label ?? "resource" }] });
  } else if (request.method === "prompts/list") {
    reply({ prompts: [{ name: "review", arguments: [{ name: "topic", required: true }] }] });
  } else if (request.method === "prompts/get") {
    write({ type: "prompt", args: request.params.arguments });
    reply({ messages: [
      { role: "assistant", content: { type: "text", text: request.params.arguments.topic } },
      { role: "user", content: { type: "resource", resource: { uri: resourceUri, text: config().label ?? "resource" } } },
    ] });
  } else if (request.method === "ping") reply({});
});
