import { LedgerAccount, LedgerBook, LedgerCurrency, LedgerTimeZone } from "@huhu/contracts";
import { z } from "zod";

export const BookId = z.uuidv4();
export const BookName = z.string().trim().min(1).max(100);
export const BookRef = z.strictObject({ bookId: BookId });
export const BookVersion = BookRef.extend({ expectedRevision: z.string().min(1) });

export const CreateBook = z.strictObject({
  name: BookName,
  defaultCurrency: LedgerCurrency,
  timeZone: LedgerTimeZone,
  firstAccount: z.object({ name: BookName, type: LedgerAccount.shape.type.default("bank") }),
});

export const BookList = z.strictObject({
  books: z.array(LedgerBook),
  activeBookId: BookId.nullable(),
  readOnly: z.boolean(),
});

export const RemovalPreview = z.strictObject({
  book: LedgerBook,
  accounts: z.int().nonnegative(),
  records: z.int().nonnegative(),
  attachments: z.int().nonnegative(),
});
export type BookList = z.infer<typeof BookList>;
export type RemovalPreview = z.infer<typeof RemovalPreview>;
export type Book = z.infer<typeof LedgerBook>;
