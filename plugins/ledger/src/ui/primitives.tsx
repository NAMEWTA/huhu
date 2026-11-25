import { ledgerMinorToDecimal } from "@huhu/contracts";
import { useEngine, useQueryClient } from "@huhu/workbench";
import { cloneElement, useId, useState, type ReactElement } from "react";
import type { Book } from "../shared/books.js";

export const currencies = ["CNY", "TWD", "USD", "JPY"];
export const bookVersion = (book: Book) => ({ bookId: book.id, expectedRevision: book.revision });
export const fieldValue = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("无法读取文件")), { once: true });
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] ?? ""), { once: true });
    reader.readAsDataURL(file);
  });
}

export function downloadFile(fileName: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function displayMoney(amount: string, currency: string) {
  // Each individual amount has a fixed scale; a total can contain more digits.
  const scale = ledgerMinorToDecimal("0", currency).split(".")[1]?.length ?? 0;
  if (scale === 0) return currency + " " + amount;
  const magnitude = amount.replace(/^-/, "").padStart(scale + 1, "0");
  return `${currency} ${amount.startsWith("-") ? "-" : ""}${magnitude.slice(0, -scale)}.${magnitude.slice(-scale)}`;
}

export function LedgerField({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const fallback = useId();
  const id = children.props.id ?? fallback;
  return <div className="hu-field"><label className="hu-field-label" htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>;
}

export function useLedgerAction() {
  const engine = useEngine();
  const queries = useQueryClient();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  async function run<T>(capability: string, input: unknown, write = true, intentKey?: string): Promise<T | undefined> {
    setError(undefined);
    setWorking(true);
    try {
      const reply = await engine.call<T>(capability, input, { write, ...(intentKey && { intentKey, idempotencyKey: intentKey }) });
      if (write) await queries.invalidateQueries({ predicate: ({ queryKey: [vault, name] }) =>
        vault === engine.vaultId && typeof name === "string" && name.startsWith("ledger.") });
      return reply;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "账本操作失败");
      return undefined;
    } finally {
      setWorking(false);
    }
  }
  return { run, working, error, setError, clearError: () => setError(undefined) };
}
