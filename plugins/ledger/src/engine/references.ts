import { createHash, randomUUID } from "node:crypto";
import { errors, HuhuError, type Caller } from "@huhu/contracts";
import { canonicalJson, type CapabilityContext, type Dispatcher } from "@huhu/kernel";
import { z } from "zod";
import { displayMoney } from "../shared/money.js";
import { ReviewNote, type DocumentRef, type Reference, type ReferenceOwner, type ReferenceView, type SaveReview, type SetReference } from "../shared/references.js";
import type { ReportQuery } from "../shared/reports.js";
import { readBudget } from "./budgets.js";
import { findRecord } from "./records.js";
import { report } from "./reports.js";
import type { BookState } from "./store.js";

const notes = z.array(z.object({ path: z.string(), id: z.string().nullable() }));
const archives = z.array(z.object({ path: z.string(), noteId: z.string().nullable() }));
type ResourceKind = DocumentRef["kind"];

function sameOwner(first: ReferenceOwner, second: ReferenceOwner) {
  if (first.kind !== second.kind) return false;
  if (first.kind === "book" || second.kind === "book") return true;
  return first.id === second.id;
}

export function documentKey({ kind, path, documentId }: DocumentRef) {
  return JSON.stringify([kind, documentId, documentId === null ? path : null]);
}

export function referencesFor(state: BookState, owner: ReferenceOwner) {
  if (owner.kind === "budget") readBudget(state, owner.id);
  if (owner.kind === "record") findRecord(state, owner.id);
  return state.resourceReferences.filter((reference) => sameOwner(reference.owner, owner));
}

function findReference(state: BookState, owner: ReferenceOwner, id: string) {
  const reference = referencesFor(state, owner).find((row) => row.id === id);
  if (!reference) throw errors.notFound("找不到这条财务笔记关联");
  return reference;
}

export function saveReference(state: BookState, { owner, replaceId }: z.infer<typeof SetReference>, resource: DocumentRef) {
  const previous = replaceId ? findReference(state, owner, replaceId) : undefined;
  const key = documentKey(resource);
  if (referencesFor(state, owner).some((row) => row.id !== replaceId && documentKey(row.resource) === key)) {
    throw errors.nameConflict("该资源已关联");
  }
  const reference = { id: previous?.id ?? randomUUID(), owner, resource };
  state.resourceReferences = state.resourceReferences.filter(({ id }) => id !== replaceId);
  state.resourceReferences.push(reference);
  return reference;
}

export function removeReference(state: BookState, owner: ReferenceOwner, id: string) {
  const reference = findReference(state, owner, id);
  state.resourceReferences = state.resourceReferences.filter((row) => row !== reference);
  return reference;
}

function safeMarkdown(text: string) {
  return text
    .replace(/\s+/gu, " ")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/[\\`*_~[\]#|]/gu, "\\$&");
}

export function draftReview(state: BookState, input: z.infer<typeof ReportQuery>) {
  const { from, to, series } = report(state, input);
  const rows = series.map(({ currency, incomeMinor, expenseMinor, transferInMinor, transferOutMinor }) => {
    const net = (BigInt(incomeMinor) - BigInt(expenseMinor)).toString();
    return "| " + [currency, ...[incomeMinor, expenseMinor, net, transferInMinor, transferOutMinor].map((amount) => displayMoney(amount, currency))].join(" | ") + " |";
  });
  const markdown = [
    "# 账本复盘",
    "",
    `- 账本：${safeMarkdown(state.book.name)}`,
    `- 期间：${from} 至 ${to}（${state.book.timeZone} 业务日）`,
    `- 币种：${series.map(({ currency }) => currency).join("、")}`,
    `- 统计口径：${input.includeOffset ? "包含平账组与历史排除流水" : "排除平账组与历史排除流水"}。转账单列，币种分别汇总。`,
    "",
    "| 币种 | 收入 | 支出 | 净收入 | 转入 | 转出 |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
  ].join("\n");
  return { revision: state.book.revision, markdown };
}

export class LedgerReferences {
  constructor(private readonly dispatcher: () => Pick<Dispatcher, "call">) {}

  private async call(context: CapabilityContext, capability: "notes.list" | "archives.list" | "notes.create", input: unknown, idempotencyKey?: string) {
    context.assertCapabilityCurrent?.();
    const reply = await this.dispatcher().call(context.caller as Caller, { capability, input, requestId: context.requestId, idempotencyKey }, context.signal, context.subject ?? context.caller);
    if (!reply.ok) throw new HuhuError(reply.error.code, reply.error.message);
    return reply.data;
  }

  private async documents(context: CapabilityContext, kind: ResourceKind): Promise<DocumentRef[] | null> {
    try {
      if (kind === "archive") {
        const rows = archives.parse(await this.call(context, "archives.list", {}));
        return rows.map(({ path, noteId }) => ({ kind, path, documentId: noteId }));
      }
      const rows = notes.parse(await this.call(context, "notes.list", { filter: "all" }));
      return rows.filter(({ path }) => path.split("/")[0]?.toLowerCase() !== "archives").map(({ path, id }) => ({ kind, path, documentId: id }));
    } catch (error) {
      if (error instanceof HuhuError && (error.code === "PLUGIN_DISABLED" || error.code === "CAPABILITY_NOT_FOUND")) return null;
      throw error;
    }
  }

  async select(context: CapabilityContext, { kind, path }: z.infer<typeof SetReference>["resource"]) {
    const documents = await this.documents(context, kind);
    if (documents === null) throw errors.pluginDisabled("notes");
    const document = documents.find((row) => row.path === path);
    if (!document) throw errors.notFound("所选笔记或档案已不可用");
    return document;
  }

  async resolve(context: CapabilityContext, rows: readonly Reference[]): Promise<ReferenceView[]> {
    const kinds = [...new Set(rows.map(({ resource }) => resource.kind))];
    const directories = new Map(await Promise.all(kinds.map(async (kind) => [kind, await this.documents(context, kind)] as const)));
    context.assertCapabilityCurrent?.();
    return rows.map((row) => {
      const documents = directories.get(row.resource.kind);
      if (!documents) return { ...row, status: "notes-disabled" };
      const resource = documents.find(({ path, documentId }) => (row.resource.documentId === null ? path === row.resource.path : documentId === row.resource.documentId));
      return resource ? { ...row, resource, status: "available" } : { ...row, status: "missing" };
    });
  }

  async get(context: CapabilityContext, state: BookState, owner: ReferenceOwner, id: string) {
    const [view] = await this.resolve(context, [findReference(state, owner, id)]);
    return view!;
  }

  async createReview(context: CapabilityContext, state: BookState, input: z.infer<typeof SaveReview>) {
    const { markdown } = draftReview(state, input);
    const key = context.parentOperationId ?? context.idempotencyKey;
    const idempotencyKey = key
      ? createHash("sha256")
          .update(canonicalJson([context.caller, context.subject ?? null, context.delegatedBy ?? null, "ledger-review", key]))
          .digest("hex")
      : undefined;
    return ReviewNote.parse(await this.call(context, "notes.create", { name: input.name, body: markdown }, idempotencyKey));
  }
}
