import type { CommandLine } from "electron";

const inputDeferral = "DeferRendererTasksAfterInput";

function hasEnabledInputDeferral(list: string): boolean {
  return list.split(",").some((entry) => {
    let name = entry;
    // Chromium parses parameters, group, then field trial, trimming each segment.
    for (const separator of [":", ".", "<"]) {
      const [prefix = "", , extra] = name.split(separator, 3);
      if (extra !== undefined) return false;
      name = prefix.trim();
    }
    return name.replace(/^\*/u, "") === inputDeferral;
  });
}

/** 暂时兼容 Chromium 152 密集输入时的终端收包延迟。升级 Chromium 时用原桌面洪流用例复验。 */
export function applyChromium152InputDeferral(commandLine: Pick<CommandLine, "appendSwitch" | "getSwitchValue">, chromeVersion: string | undefined): void {
  if (chromeVersion?.split(".", 1)[0] !== "152") return;

  const disabled = commandLine.getSwitchValue("disable-features");
  const alreadyDisabled = disabled.split(",").some((entry) => entry.trim().replace(/^\*/u, "").split(/[<:]/u, 1)[0] === inputDeferral);
  // Preserve explicit settings, including flags with Chromium trial or parameter suffixes.
  if (alreadyDisabled || hasEnabledInputDeferral(commandLine.getSwitchValue("enable-features"))) return;

  commandLine.appendSwitch("disable-features", disabled ? `${disabled},${inputDeferral}` : inputDeferral);
}
