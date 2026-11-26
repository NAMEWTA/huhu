import { spawnSync } from "node:child_process";
import { closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const production = fileURLToPath(new URL("../oxlint.json", import.meta.url));
const oxlint = fileURLToPath(new URL("../node_modules/oxlint/bin/oxlint", import.meta.url));
const config = process.argv[2] ? path.resolve(process.argv[2]) : production;
const forbiddenImport = "eslint(no-restricted-imports)";
const periodicTimer = "huhu-scheduling(no-private-periodic-timer)";
const directNotification = "huhu-scheduling(no-direct-notification-fallback)";
const cases = [
  { file: "packages/check/src/any.ts", source: "export const value: any = 1;", code: "typescript(no-explicit-any)" },
  { file: "packages/check/src/deep.ts", source: 'import value from "@huhu/tasks/src/private"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/engine/react.ts", source: 'import value from "react"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/engine/workbench.ts", source: 'import value from "@huhu/workbench"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/node.ts", source: 'import value from "node:fs"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/vault.ts", source: 'import value from "@huhu/vault"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/engine.ts", source: 'import value from "@huhu/plugin-tasks/engine"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/relative-engine.ts", source: 'import value from "../engine/view.js"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/panels/relative-engine.ts", source: 'export { value } from "../../engine/view.js";', code: forbiddenImport },
  { file: "plugins/check/src/ui/engine-type.ts", source: 'import type { View } from "../engine/view.js"; export type Sample = View;' },
  { file: "plugins/check/src/engine/private.ts", source: 'import type { View } from "../../../tasks/src/engine/private.js"; export type Sample = View;', code: forbiddenImport },
  { file: "plugins/check/src/ui/private.ts", source: 'import value from "../../../tasks/src/ui/private.js"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/ui/panels/private.ts", source: 'import value from "../../../../tasks/src/ui/private.js"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/shared/private.ts", source: 'import value from "../../../tasks/src/shared/private.js"; export { value };', code: forbiddenImport },
  { file: "plugins/check/src/engine/allowed.ts", source: 'import value from "@huhu/vault"; export { value }; export const timeout = () => AbortSignal.timeout(100);' },
  { file: "plugins/check/src/ui/allowed.ts", source: 'import value from "@huhu/workbench"; export { value };' },
  { file: "plugins/check/src/ui/panels/allowed.ts", source: 'import value from "../../shared/view.js"; export { value };' },
  { file: "apps/check/src/bootstrap.ts", source: 'import value from "@huhu/plugin-tasks/ui"; export { value };' },
  { file: "plugins/tasks/src/engine/private-scan.ts", source: "export const start = (scan: () => void) => setInterval(scan, 5_000);", code: periodicTimer },
  { file: "plugins/mail/src/engine/private-schedule.cjs", source: "module.exports = (sync) => globalThis.setInterval(sync, 60_000);", code: periodicTimer },
  { file: "plugins/mail/src/engine/aliased-timer.ts", source: 'export const { setInterval: schedule } = globalThis;', code: periodicTimer },
  { file: "plugins/tasks/src/shared/private-clock.ts", source: 'import { setInterval as every } from "node:timers/promises"; export { every };', code: periodicTimer },
  { file: "plugins/tasks/src/engine/chained-clock.ts", source: "export function poll() { setTimeout(poll, 5_000); }", code: periodicTimer },
  { file: "plugins/tasks/src/engine/reminder-fallback.ts", source: 'export const fallback = (api: { call(name: string): void }) => api.call("notifications.create");', code: directNotification },
  { file: "plugins/automations/src/engine/reminder-fallback.ts", source: "export const fallback = (sink: { notify(): void }) => sink.notify();", code: directNotification },
  { file: "plugins/mail/src/engine/fallback-event.ts", source: 'export const fallback = (events: { publish(type: string): void }) => events.publish("notification.created");', code: directNotification },
  { file: "plugins/tasks/src/engine/technical-timeouts.ts", source: 'export function timeout(abort: () => void, acknowledge: () => void, finalize: () => void) { setTimeout(abort, 100); setTimeout(acknowledge, 200); setTimeout(finalize, 300); }' },
  { file: "plugins/tasks/src/engine/receipt-ack.ts", source: "// oxlint-disable-next-line huhu-scheduling/no-private-periodic-timer -- 轮询原生协议回执，作用域随连接关闭。\nexport const watch = (receiveAck: () => void) => setInterval(receiveAck, 100);" },
  { file: "plugins/tasks/src/engine/reminder-port.ts", source: 'export const reminder = { action: { capability: "notifications.create" } };' },
  { file: "plugins/tasks/src/ui/clock.ts", source: "export const watch = (render: () => void) => setInterval(render, 1_000);" },
];

const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-lint-rules-"));
try {
  const sandboxConfig = path.join(sandbox, "oxlint.json");
  // The production directory selectors are relative to the config.
  copyFileSync(config, sandboxConfig);
  mkdirSync(path.join(sandbox, "scripts"));
  copyFileSync(new URL("./lint-scheduling.mjs", import.meta.url), path.join(sandbox, "scripts/lint-scheduling.mjs"));
  for (const { file, source } of cases) {
    const destination = path.join(sandbox, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, source + "\n");
  }
  const normalize = (file) => path.relative(sandbox, path.resolve(sandbox, file)).split(path.sep).join("/");
  function check(expectedCases, label) {
    const output = path.join(sandbox, "diagnostics.json");
    const errors = path.join(sandbox, "linter-errors.txt");
    const stdout = openSync(output, "w");
    const stderr = openSync(errors, "w");
    let result;
    try {
      result = spawnSync(process.execPath, [oxlint, "--config", sandboxConfig, "--format", "json", ...cases.map(({ file }) => file)], {
        cwd: sandbox,
        stdio: ["ignore", stdout, stderr],
      });
    } finally {
      closeSync(stdout);
      closeSync(stderr);
    }
    if (result.error) throw result.error;
    const report = readFileSync(output, "utf8");
    if (result.status !== 1) throw new Error(`lint 样例预期至少有一个违规，退出码 ${result.status}\n${report}${readFileSync(errors, "utf8")}`);
    const { diagnostics, number_of_files: filesChecked } = JSON.parse(report);
    if (filesChecked !== cases.length) throw new Error(`lint 只检查了 ${filesChecked} 个样例，预期 ${cases.length}\n${report}`);
    const got = diagnostics.map(({ filename, code, severity }) => `${normalize(filename)} ${code} ${String(severity).toLowerCase()}`).sort();
    const expected = expectedCases.flatMap(({ file, code }) => code ? [`${file} ${code} error`] : []).sort();
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      const missing = expected.filter((item) => !got.includes(item));
      const unexpected = got.filter((item) => !expected.includes(item));
      throw new Error(`${label}与 lint 样例不符\n缺少：${missing.join(", ")}\n意外报错：${unexpected.join(", ")}`);
    }
  }

  check(cases, "生产配置");
  const withoutScheduling = JSON.parse(readFileSync(sandboxConfig, "utf8"));
  for (const { rules } of withoutScheduling.overrides) {
    delete rules["huhu-scheduling/no-private-periodic-timer"];
    delete rules["huhu-scheduling/no-direct-notification-fallback"];
  }
  writeFileSync(sandboxConfig, JSON.stringify(withoutScheduling));
  check(cases.filter(({ code }) => code !== periodicTimer && code !== directNotification), "移除调度门禁后的配置");
  console.log("lint 规则拦截样例及调度门禁删除反证：OK");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
