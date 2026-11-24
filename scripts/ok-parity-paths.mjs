import { mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

export const okParitySource = join(root, "docs/upstream/ok-parity");

export function createOkParityRun(name) {
  const integration = join(root, "temp/dev/2026-11-18-issue2-closeout/integration");
  mkdirSync(integration, { recursive: true });
  return mkdtempSync(join(integration, name + "-"));
}
