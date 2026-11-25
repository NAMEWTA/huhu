import { createHash, randomUUID } from "node:crypto";
import { errors, isHuhuError, ledgerBusinessDate, ledgerBusinessDayRange } from "@huhu/contracts";
import { canonicalJson, type CapabilityContext } from "@huhu/kernel";
import type { z } from "zod";
import { loanSchedule } from "../domain/loans.js";
import { loanPeriodId, type ConfirmLoan, type Loan, type LoanHistory, type LoanList, type LoanPayment, type PreviewLoan, type SaveLoan } from "../shared/loans.js";
import { requireActiveBook, validateLedgerAccount } from "./accounts.js";
import { saveRecord } from "./records.js";
import type { BookState, LedgerStore } from "./store.js";

type Confirmation = z.infer<typeof ConfirmLoan>;
type PreviewIdentity = Omit<Confirmation, "previewId" | "selected">;
const digest = (input: PreviewIdentity) => createHash("sha256").update(canonicalJson(input)).digest("hex");

function findLoan(state: BookState, loanId: string) {
  const loan = state.loans.find(({ id, bookId }) => id === loanId && bookId === state.book.id);
  if (!loan) throw errors.notFound("当前账本没有这笔贷款");
  return loan;
}

export function saveLoan(state: BookState, { definition }: z.infer<typeof SaveLoan>) {
  validateLedgerAccount(state, definition.accountId, definition.currency);
  loanSchedule(definition);
  const loan: Loan = { id: randomUUID(), bookId: state.book.id, definition };
  state.loans.push(loan);
  return loan;
}

export function removeLoan(state: BookState, loanId: string) {
  const loan = findLoan(state, loanId);
  state.loans = state.loans.filter((row) => row !== loan);
  return loan;
}

export function loanList(store: LedgerStore, state: BookState): LoanList {
  const counts = new Map<string, number>();
  for (const { loanId } of state.loanPayments) counts.set(loanId, (counts.get(loanId) ?? 0) + 1);
  return {
    revision: state.book.revision,
    businessDate: store.businessDate(state.book),
    rows: state.loans.map((loan) => ({ ...loan, generated: counts.get(loan.id) ?? 0 })),
  };
}

export function previewLoan(store: LedgerStore, state: BookState, input: z.infer<typeof PreviewLoan>): LoanHistory {
  const loan = findLoan(state, input.loanId);
  const { definition } = loan;
  const accountId = input.accountId ?? definition.accountId;
  const accountAvailable = state.accounts.some(({ id, status, currency }) =>
    id === accountId && status === "active" && currency === definition.currency);
  const through = store.businessDate(state.book);
  const identity = { bookId: state.book.id, expectedRevision: state.book.revision, loanId: loan.id, accountId, through };
  const generated = new Set(state.loanPayments.filter(({ loanId }) => loanId === loan.id).map(({ number }) => number));
  const refs = new Map(state.recordReferences.filter(({ kind }) => kind === "occurrence").map(({ targetId, recordId }) => [targetId, recordId]));
  return {
    loan, accountAvailable, preview: { ...identity, previewId: digest(identity) },
    installments: loanSchedule(definition).map((row) => ({
      ...row,
      status: generated.has(row.number) ? "generated" : row.paymentMinor === "0" ? "no-payment" : row.date <= through ? "due" : "future",
      recordId: refs.get(loanPeriodId(loan.id, row.number)) ?? null,
    })),
  };
}

function confirmed(state: BookState, loanId: string, selected: number[]) {
  const payments = new Map(state.loanPayments.filter((row) => row.loanId === loanId).map((row) => [row.number, row]));
  const found = selected.toSorted((a, b) => a - b).flatMap((number) => payments.get(number) ?? []);
  return found.length === selected.length ? found : undefined;
}

export async function confirmLoan(store: LedgerStore, context: CapabilityContext, { previewId, selected, ...identity }: Confirmation): Promise<LoanPayment[]> {
  const { bookId, loanId, accountId, expectedRevision, through } = identity;
  if (digest(identity) !== previewId) throw errors.invalidInput("请重新预览贷款补记");
  await store.idle();
  const state = store.snapshot(bookId);
  const loan = findLoan(state, loanId);
  const existing = confirmed(state, loanId, selected);
  if (existing) return existing;

  try {
    return await store.change(context, bookId, expectedRevision, (draft) => {
      requireActiveBook(draft);
      const { definition } = loan;
      validateLedgerAccount(draft, accountId, definition.currency);
      if (through > store.businessDate(draft.book)) throw errors.invalidInput("预览日期已失效，请重新预览");
      const schedule = loanSchedule(definition);
      const chosen = new Set(selected);
      const periods = schedule.filter(({ number }) => chosen.has(number));
      if (periods.length !== chosen.size || periods.some(({ date, paymentMinor }) => date > through || paymentMinor === "0")) {
        throw errors.invalidInput("只能补记预览中有款项且已到期的期次");
      }
      const prior = new Map(draft.loanPayments.filter((row) => row.loanId === loanId).map((row) => [row.number, row]));
      return periods.map(({ date, number, paymentMinor }) => {
        const paid = prior.get(number);
        if (paid) return paid;
        const occurredAt = ledgerBusinessDayRange(date, draft.book.timeZone).from;
        if (ledgerBusinessDate(occurredAt, draft.book.timeZone) !== date) throw errors.invalidInput("还款期次所在的业务日不可入账");
        const record = saveRecord(draft, {
          type: "expense", accountId, currency: definition.currency, amountMinor: paymentMinor, occurredAt,
          memo: `第 ${number} 期还款`, payee: null, categoryId: null, tagIds: [], attachmentIds: [],
        }, definition.name);
        const receipt = { loanId, number, recordId: record.id };
        draft.loanPayments.push(receipt);
        draft.recordReferences.push({ kind: "occurrence", targetId: loanPeriodId(loanId, number), recordId: record.id });
        return receipt;
      });
    });
  } catch (failure) {
    // Another confirmation may have won the book revision while this one was queued.
    if (isHuhuError(failure) && failure.code === "VERSION_CONFLICT") {
      const receipt = confirmed(store.snapshot(bookId), loanId, selected);
      if (receipt) return receipt;
    }
    throw failure;
  }
}
