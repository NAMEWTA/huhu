import type { z } from "zod";
import type { MailAccount } from "../engine/accounts.js";
import type { Draft } from "../engine/drafts.js";
import type { draftSummary } from "../engine/drafts.js";
import type { outboxSummary, outboxView } from "../engine/outbox.js";

export type { MailAccount, Draft };
export type DraftSummary = z.infer<typeof draftSummary>;
export type DeliverySummary = z.infer<typeof outboxSummary>;
export type Delivery = NonNullable<z.infer<typeof outboxView>>;
