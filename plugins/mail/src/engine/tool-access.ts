import { createHash } from "node:crypto";
import { errors, isWorkbenchCaller } from "@huhu/contracts";
import type { CapabilityContext } from "@huhu/kernel";
import { z } from "zod";

export const mailTool = { plugin: "mail", exposable: true, defaultExposed: false } as const;
export const mailRequestId = z.uuidv4().optional();

export function requireMailCaller(caller: string, name: string, desktopOnly = false) {
  if (caller === "cli" || caller === "mcp" || caller === "http" || caller === "desktop" || (!desktopOnly && isWorkbenchCaller(caller))) return;
  throw errors.permissionDenied(name);
}

export function mailActor({ caller, subject }: CapabilityContext, name: string) {
  requireMailCaller(caller, name);
  if (!subject || (caller === "http" && subject === "http")) throw errors.permissionDenied(name);
  return createHash("sha256")
    .update(JSON.stringify([caller, subject]))
    .digest("hex");
}
