const fs = require("node:fs");
const path = require("node:path");
const userData = process.env.HUHU_DESKTOP_USER_DATA;
if (userData !== path.join(__dirname, "profile")) throw new Error("unexpected userData");
fs.writeFileSync(path.join(userData, "child-observation.json"), JSON.stringify({ pid: process.pid, node: process.versions.node, userData, argv: process.argv.slice(2) }));
process.parentPort.on("message", (msg) => {
  if (msg.data?.type === "shutdown") process.exit(0);
});
process.parentPort.postMessage({ type: "ready", port: 32100, rendererToken: "synthetic", vaultId: "vault-synthetic" });
