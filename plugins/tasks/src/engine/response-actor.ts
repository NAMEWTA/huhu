import { isWorkbenchCaller } from "@huhu/contracts";
import { z } from "zod";

export const ResponseActor = z.strictObject({
  caller: z.string().regex(/^(desktop|cli|mcp|http|web:.+)$/u),
  subject: z.string().min(1),
  owner: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
});
export type ResponseActor = z.infer<typeof ResponseActor>;

export function sameResponseActor(prior: ResponseActor | undefined, actor: ResponseActor): boolean {
  return prior === undefined || (prior.caller === actor.caller && prior.subject === actor.subject);
}

export function responseCommentActor(actor: ResponseActor | undefined, legacyExternal = false) {
  if (!actor) return legacyExternal ? { source: "external" as const } : { source: "human" as const, author: "我" };
  const { caller } = actor;
  if (caller === "desktop") return { source: "human" as const, author: "我" };
  if (isWorkbenchCaller(caller)) return { source: "human" as const, author: "Web" };
  return { source: "external" as const, author: caller };
}
