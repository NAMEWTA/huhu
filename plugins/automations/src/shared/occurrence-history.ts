import { PlanOccurrenceSchema } from "@huhu/contracts";
import { z } from "zod";

export const HistoryState = PlanOccurrenceSchema.shape.state;
export const HistoryRow = z.strictObject({
  id: z.string(),
  planId: z.string(),
  source: z.string(),
  title: z.string(),
  at: z.iso.datetime(),
  trigger: z.enum(["manual", "scheduled", "event"]),
  state: HistoryState,
  terminalRunId: z.string().optional(),
  counts: z.strictObject({ processed: z.int().nonnegative(), skipped: z.int().nonnegative() }).optional(),
});
export const HistoryInput = z.strictObject({
  planId: z.string().optional(),
  source: z.string().optional(),
  query: z.string().max(256).optional(),
  state: HistoryState.or(z.literal("attention")).optional(),
  from: z.iso.datetime().optional(),
  until: z.iso.datetime().optional(),
  cursor: HistoryRow.pick({ at: true, id: true }).optional(),
  limit: z.int().min(1).max(100).default(30),
});
export const HistoryPage = z.strictObject({
  rows: z.array(HistoryRow),
  next: HistoryRow.pick({ at: true, id: true }).nullable(),
  sources: z.array(z.string()),
});
export type HistoryRow = z.infer<typeof HistoryRow>;
export type HistoryInput = z.input<typeof HistoryInput>;
export type HistoryPage = z.infer<typeof HistoryPage>;

function compare(a: Pick<HistoryRow, "at" | "id">, b: Pick<HistoryRow, "at" | "id">) {
  return b.at.localeCompare(a.at) || b.id.localeCompare(a.id);
}

export function historyPage(rows: HistoryRow[], input: z.output<typeof HistoryInput>): HistoryPage {
  const search = input.query?.trim().toLowerCase();
  const result = rows
    .filter((row) => {
      const matchesState = !input.state || (input.state === "attention" ? ["failed", "unknown", "blocked"].includes(row.state) : row.state === input.state);
      return (
        matchesState &&
        (!input.planId || row.planId === input.planId) &&
        (!input.source || row.source === input.source) &&
        (!input.from || row.at >= input.from) &&
        (!input.until || row.at < input.until) &&
        (!input.cursor || compare(row, input.cursor) > 0) &&
        (!search || [row.id, row.planId, row.title].some((text) => text.toLowerCase().includes(search)))
      );
    })
    .sort(compare)
    .slice(0, input.limit + 1);
  const page = result.slice(0, input.limit);
  const last = result.length > input.limit ? page.at(-1) : undefined;
  return { rows: page, next: last ? { at: last.at, id: last.id } : null, sources: [...new Set(rows.map(({ source }) => source))].sort() };
}
