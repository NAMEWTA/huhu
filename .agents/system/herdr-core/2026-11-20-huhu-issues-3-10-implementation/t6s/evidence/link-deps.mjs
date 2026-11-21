import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const [candidate, integration] = process.argv.slice(2).map((item) => fs.realpathSync(item));
const hash = (root, name) => createHash("sha256").update(fs.readFileSync(path.join(root, name), "utf8").replace(/\r\n/g, "\n")).digest("hex");
const lock = "pnpm-lock.yaml";
if (hash(candidate, lock) !== hash(integration, lock)) {
  throw new Error("Different lockfile");
}

const workspaceFolders = ["apps", "packages", "plugins", "vendor", "examples/plugins"];
const projects = ["", ...workspaceFolders.flatMap((folder) =>
  fs.readdirSync(path.join(candidate, folder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(folder, entry.name))
    .filter((entry) => fs.existsSync(path.join(candidate, entry, "package.json")))
)];
const projectPaths = new Map(projects.map((project) => [fs.realpathSync(path.join(integration, project)).toLowerCase(), path.join(candidate, project)]));
let external = 0;
let workspace = 0;
function populate(from, to, allowScope = true) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const origin = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (allowScope && entry.name.startsWith("@") && entry.isDirectory()) {
      populate(origin, dest, false);
      continue;
    }
    if (!fs.statSync(origin).isDirectory()) continue;
    const real = fs.realpathSync(origin);
    const local = projectPaths.get(real.toLowerCase());
    fs.symlinkSync(local ?? real, dest, "junction");
    if (local) workspace++; else external++;
  }
}
for (const project of projects) {
  populate(path.join(integration, project, "node_modules"), path.join(candidate, project, "node_modules"));
}
console.log(JSON.stringify({ lockSha256: hash(candidate, lock), projects: projects.length, external, workspace }));

