const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2]);
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const pending = ["node_modules/imapflow"];
const seen = new Map();
function dependency(from, name) {
  let folder = from;
  for (;;) {
    if (path.posix.basename(folder) !== "node_modules") {
      const candidate = path.posix.join(folder, "node_modules", name);
      if (lock.packages[candidate]) return candidate;
    }
    if (!folder || folder === ".") throw new Error(`${from} cannot resolve ${name}`);
    folder = path.posix.dirname(folder);
  }
}
while (pending.length) {
  const key = pending.pop();
  if (seen.has(key)) continue;
  const entry = lock.packages[key];
  const resolved = JSON.parse(fs.readFileSync(path.join(root, key, "package.json"), "utf8"));
  if (resolved.version !== entry.version || !entry.integrity?.startsWith("sha512-")) {
    throw new Error(`Missing version or integrity agreement for ${key}`);
  }
  const deps = Object.keys(entry.dependencies ?? {}).map((name) => dependency(key, name));
  pending.push(...deps);
  seen.set(key, { version: entry.version, resolved: entry.resolved, integrity: entry.integrity });
}
console.log(JSON.stringify({ imapflow: seen.get("node_modules/imapflow"), count: seen.size, packages: Object.fromEntries([...seen.entries()].sort()) }, null, 2));
