import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const production = fileURLToPath(new URL("../oxlint.json", import.meta.url));
const oxlint = fileURLToPath(new URL("../node_modules/oxlint/bin/oxlint", import.meta.url));
const config = process.argv[2] ? path.resolve(process.argv[2]) : production;
const forbiddenImport = "eslint(no-restricted-imports)";
const cases = [
  { file: "packages/check/src/any.ts", source: "export const value: any = 1;", code: "typescript(no-explicit-any)" },
  { file: "packages/check/src/deep.ts", source: 'import value from "@huhu/tasks/src/private"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/engine/react.ts", source: 'import value from "react"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/engine/workbench.ts", source: 'import value from "@huhu/workbench"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/node.ts", source: 'import value from "node:fs"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/vault.ts", source: 'import value from "@huhu/vault"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/engine.ts", source: 'import value from "@huhu/plugin-tasks/engine"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/engine/private.ts", source: 'import type { View } from "../../../tasks/src/engine/private.js"; export type Sample = View;', code: forbiddenImport },
  { file: "plugins/check/src/ui/private.ts", source: 'import value from "../../../tasks/src/ui/private.js"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/panels/private.ts", source: 'import value from "../../../../tasks/src/ui/private.js"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/shared/private.ts", source: 'import value from "../../../tasks/src/shared/private.js"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/engine/allowed.ts", source: 'import value from "@huhu/vault"; export { value }; export const timeout = () => AbortSignal.timeout(100);' },
  { file: "plugins/check/src/ui/allowed.ts", source: 'import value from "@huhu/workbench"; export { value };' },
  { file: "plugins/check/src/ui/panels/allowed.ts", source: 'import value from "../../shared/view.js"; export { value };' },
  { file: "apps/check/src/bootstrap.ts", source: 'import value from "@huhu/plugin-tasks/ui"; export { value };' },
];

const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-lint-rules-"));
try {
  const sandboxConfig = path.join(sandbox, "oxlint.json");
  // The production directory selectors are relative to the config.
  copyFileSync(config, sandboxConfig);
  for (const { file, source } of cases) {
    const destination = path.join(sandbox, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, source + "\n");
  }
  const result = spawnSync(process.execPath, [oxlint, "--config", sandboxConfig, "--format", "json", ...cases.map(({ file }) => file)], {
    cwd: sandbox,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 1) throw new Error(`lint 样例预期至少有一个违规，退出码 ${result.status}\n${result.stdout}${result.stderr}`);
  const { diagnostics, number_of_files: filesChecked } = JSON.parse(result.stdout);
  if (filesChecked !== cases.length) throw new Error(`lint 只检查了 ${filesChecked} 个样例，预期 ${cases.length}\n${result.stdout}`);
  const normalize = (file) => path.relative(sandbox, path.resolve(sandbox, file)).split(path.sep).join("/");
  const got = diagnostics.map(({ filename, code, severity }) => `${normalize(filename)} ${code} ${String(severity).toLowerCase()}`).sort();
  const expected = cases.flatMap(({ file, code }) => code ? [`${file} ${code} error`] : []).sort();
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    const missing = expected.filter((item) => !got.includes(item));
    const unexpected = got.filter((item) => !expected.includes(item));
    throw new Error(`生产 lint 规则与样例不符\n未拦截：${missing.join(", ")}\n意外报错：${unexpected.join(", ")}`);
  }
  console.log("lint 规则拦截样例：OK");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
