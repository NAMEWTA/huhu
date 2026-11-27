import { isWorkbenchCaller } from "@huhu/contracts";
import { z } from "zod";

export const ResponseActor = z.strictObject({
  caller: z.string().regex(/^(desktop|cli|mcp|http|web:.+)$/u),
  subject: z.string().min(1),
  owner: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
  github: z
    .strictObject({
      sourceId: z.uuidv4(),
      repositoryId: z.int().positive(),
      issueId: z.int().positive(),
      eventId: z.string(),
      actorId: z.int().positive(),
      login: z.string(),
    })
    .optional(),
});
export type ResponseActor = z.infer<typeof ResponseActor>;

export function sameResponseActor(prior: ResponseActor | undefined, actor: ResponseActor): boolean {
  if (!prior) return !actor.github;
  return prior.caller === actor.caller && prior.subject === actor.subject && JSON.stringify(prior.github) === JSON.stringify(actor.github);
}

export function responseCommentActor(actor: ResponseActor | undefined, legacyExternal = false) {
  if (!actor) return legacyExternal ? { source: "external" as const } : { source: "human" as const, author: "我" };
  const { caller } = actor;
  if (caller === "desktop") return { source: "human" as const, author: "我" };
  if (isWorkbenchCaller(caller)) return { source: "human" as const, author: "Web" };
  return { source: "external" as const, author: actor.github ? `GitHub @${actor.github.login}` : caller };
}
