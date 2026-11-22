import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { endpointRootBinding } from "@huhu/vault";
import { app, Notification } from "electron";
import { exitSaveMessage, isExitSaveReceipt, type ExitSaveReceipt, type ExitSaveSummary } from "../exit-ipc.js";

function receiptFile(vaultRoot: string): string {
  const key = createHash("sha256").update(endpointRootBinding(vaultRoot)).digest("hex");
  return path.join(app.getPath("userData"), "exit-save", key + ".json");
}

function readReceipt(file: string): ExitSaveReceipt | undefined {
  try {
    const receipt: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (isExitSaveReceipt(receipt)) return { files: receipt.files, drafts: receipt.drafts, id: receipt.id };
  } catch {
    // 首次打开或记录不可读时，工作台仍可正常启动。
  }
}

let outgoing: { id: string; notification: Notification; shown: boolean } | undefined;

export function showExitSaveFeedback(vaultRoot: string, summary: ExitSaveSummary): void {
  const message = exitSaveMessage(summary);
  if (!message) return;
  const receipt = { id: randomUUID(), ...summary };
  let file: string | undefined;
  try {
    file = receiptFile(vaultRoot);
    const temporary = file + ".tmp";
    try {
      mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(temporary, JSON.stringify(receipt), { mode: 0o600 });
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
  } catch (error) {
    console.warn("退出保存提示无法写入本机", error);
  }
  try {
    if (!Notification.isSupported()) return;
    const notification = new Notification({ title: "HUHU 文档保存", body: message, silent: true });
    outgoing = { id: receipt.id, notification, shown: false };
    notification.once("show", () => {
      if (outgoing?.id === receipt.id) outgoing.shown = true;
      try {
        if (file && readReceipt(file)?.id === receipt.id) rmSync(file, { force: true });
      } catch {
        // 系统通知已经显示，记录可在下次打开工作台时清理。
      }
    });
    notification.show();
  } catch (error) {
    console.warn("系统保存提示不可用", error);
  }
}

export function readExitSaveFeedback(vaultRoot: string): ExitSaveReceipt | null {
  try {
    const receipt = readReceipt(receiptFile(vaultRoot));
    if (!receipt) return null;
    if (outgoing?.id === receipt.id) {
      if (outgoing.shown) return null;
      const { notification } = outgoing;
      outgoing = undefined;
      notification.removeAllListeners("show");
      try {
        notification.close();
      } catch {
        // 系统通知失效时仍交给工作台显示本机回执。
      }
    }
    return receipt;
  } catch {
    return null;
  }
}

export function acknowledgeExitSaveFeedback(vaultRoot: string, id: string): void {
  const file = receiptFile(vaultRoot);
  if (readReceipt(file)?.id === id) rmSync(file, { force: true });
}
