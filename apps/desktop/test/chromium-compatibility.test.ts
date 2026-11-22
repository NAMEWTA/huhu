import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { applyChromium152InputDeferral } from "../src/main/chromium-compatibility.js";

const feature = "DeferRendererTasksAfterInput";
const chromium152 = "152.0.7977.167";

function commandLine(disabled = "", enabled = "") {
  const switches = new Map([
    ["disable-features", disabled],
    ["enable-features", enabled],
  ]);
  return {
    getSwitchValue: vi.fn((name: string) => switches.get(name) ?? ""),
    appendSwitch: vi.fn((name: string, value?: string) => {
      switches.set(name, value ?? "");
    }),
  };
}

test("Chromium 152 receives the workaround when the disable list is empty", () => {
  const args = commandLine();
  applyChromium152InputDeferral(args, chromium152);
  expect(args.appendSwitch).toHaveBeenCalledExactlyOnceWith("disable-features", feature);
});

test("merges after the existing entries and applies at most once", () => {
  const disabled = "OtherFeature<Trial:param/value,AnotherFeature:mode/desktop";
  const args = commandLine(disabled, "EnabledFeature");
  applyChromium152InputDeferral(args, chromium152);
  applyChromium152InputDeferral(args, chromium152);
  expect(args.appendSwitch).toHaveBeenCalledExactlyOnceWith("disable-features", `${disabled},${feature}`);
  expect(args.getSwitchValue("enable-features")).toBe("EnabledFeature");
});

test.each([
  [`Before,${feature}<Trial:param/value,After`, ""],
  ["Before,After", `*${feature}:param/value`],
  [feature, feature],
])("preserves explicit disable and enable lists (%s, %s)", (disabled, enabled) => {
  const args = commandLine(disabled, enabled);
  applyChromium152InputDeferral(args, chromium152);
  expect(args.appendSwitch).not.toHaveBeenCalled();
});

test.each([undefined, "151.0.0.0", "153.0.0.0", "1520.0.0.0"])("leaves Chromium %s untouched", (version) => {
  const args = commandLine("Existing");
  applyChromium152InputDeferral(args, version);
  expect(args.getSwitchValue).not.toHaveBeenCalled();
  expect(args.appendSwitch).not.toHaveBeenCalled();
});

test("the desktop entry configures Chromium synchronously before app readiness and window creation", () => {
  const entry = readFileSync(new URL("../src/main/index.ts", import.meta.url), "utf8");
  const apply = entry.indexOf("\napplyChromium152InputDeferral(app.commandLine, process.versions.chrome);");
  expect(apply).toBeGreaterThanOrEqual(0);
  for (const later of ["protocol.registerSchemesAsPrivileged(", "app.whenReady()", "new BrowserWindow("]) {
    expect(apply).toBeLessThan(entry.indexOf(later));
  }
});
