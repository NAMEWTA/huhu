import { ledgerMinorToDecimal } from "@huhu/contracts";

export function displayMoney(amount: string, currency: string) {
  // An aggregate may use more digits than an individual stored amount.
  const scale = ledgerMinorToDecimal("0", currency).split(".")[1]?.length ?? 0;
  if (scale === 0) return currency + " " + amount;
  const magnitude = amount.replace(/^-/, "").padStart(scale + 1, "0");
  return `${currency} ${amount.startsWith("-") ? "-" : ""}${magnitude.slice(0, -scale)}.${magnitude.slice(-scale)}`;
}
