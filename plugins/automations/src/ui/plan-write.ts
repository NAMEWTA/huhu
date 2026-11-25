import { CapabilityError } from "@huhu/workbench";

export function uncertainPlanWrite(failure: unknown): boolean {
  if (!(failure instanceof CapabilityError)) return true;
  if (failure.details?.["outcome"] === "not-accepted") return false;
  return failure.details?.["outcome"] === "unknown" || ["INTERNAL", "UNAUTHENTICATED", "WRITE_PARTIAL"].includes(failure.code);
}
