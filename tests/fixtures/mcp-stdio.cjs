const { appendFileSync, readFileSync } = require("node:fs");
const { createInterface } = require("node:readline");
const [journal, definition] = process.argv.slice(2);
const write = (event) => appendFileSync(journal, JSON.stringify(event) + "\n");
const input = createInterface({ input: process.stdin });
write({ type: "start", pid: process.pid });
input.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
  if (request.method === "initialize") {
    reply({ protocolVersion: "2025-11-25", capabilities: { tools: { listChanged: true } }, serverInfo: { name: "local-fixture", version: "1" } });
  } else if (request.method === "tools/list") {
    const config = definition ? JSON.parse(readFileSync(definition, "utf8")) : {};
    const names = config.names ?? ["echo"];
    const page = Number(request.params?.cursor ?? 0);
    const size = config.pageSize ?? names.length;
    const next = (page + 1) * size < names.length ? String(config.repeatCursor ? 1 : page + 1) : undefined;
    reply({
      tools: names.slice(page * size, (page + 1) * size).map((name) => ({
        name, description: config.description ?? "Echo fixture", inputSchema: { type: "object", properties: { value: { type: "string" } } },
        outputSchema: { type: "object", required: ["value"], properties: { value: { type: "string", ...(config.minLength && { minLength: config.minLength }) } } },
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
  } else if (request.method === "ping") reply({});
});
