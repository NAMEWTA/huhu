import { HerdrClient } from "../src/client.ts";
const c = new HerdrClient({ endpoint: process.env.HC_SOCKET });
await c.connect();
console.log("status", JSON.stringify(await c.call("server.status")).slice(0, 200));
const run = await c.call("terminal.run", { argv: ["/bin/sh", "-c", "echo HELLO-HUHU; sleep 1"], cwd: "/tmp", labels: { "huhu.vault": "v1", "huhu.launch": "req-1" }, name: "t" });
console.log("run", JSON.stringify(run).slice(0, 300));
const list = await c.call("terminal.list", { labels: { "huhu.launch": "req-1" } });
console.log("list", JSON.stringify(list).slice(0, 300));
c.close();
