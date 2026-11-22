import type { CommandLine } from "electron";

const inputDeferral = "DeferRendererTasksAfterInput";

/** 暂时兼容 Chromium 152 密集输入时的终端收包延迟。升级 Chromium 时用原桌面洪流用例复验。 */
export function applyChromium152InputDeferral(commandLine: Pick<CommandLine, "appendSwitch" | "getSwitchValue">, chromeVersion: string | undefined): void {
  if (chromeVersion?.split(".", 1)[0] !== "152") return;

  const includesInputDeferral = (list: string) => list.split(",").some((entry) => entry.trim().replace(/^\*/u, "").split(/[<:]/u, 1)[0] === inputDeferral);
  const disabled = commandLine.getSwitchValue("disable-features");
  // Preserve explicit settings, including flags with Chromium trial or parameter suffixes.
  if (includesInputDeferral(disabled) || includesInputDeferral(commandLine.getSwitchValue("enable-features"))) return;

  commandLine.appendSwitch("disable-features", disabled ? `${disabled},${inputDeferral}` : inputDeferral);
}
