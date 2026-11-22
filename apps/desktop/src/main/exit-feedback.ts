import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { endpointRootBinding } from "@huhu/vault";
import { app, Notification } from "electron";
import { exitSaveMessage, isExitSaveSummary, type ExitSaveSummary } from "../exit-ipc.js";

type Receipt = ExitSaveSummary & { id: string };

function receiptFile(vaultRoot: string): string {
  const key = createHash("sha256").update(endpointRootBinding(vaultRoot)).digest("hex");
  return path.join(app.getPath("userData"), "exit-save", key + ".json");
}

function readReceipt(file: string): Receipt | undefined {
  try {
    const receipt: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (isExitSaveSummary(receipt) && "id" in receipt && typeof receipt.id === "string") return { files: receipt.files, drafts: receipt.drafts, id: receipt.id };
  } catch {
    // 首次打开或记录不可读时，工作台仍可正常启动。
  }
}

let notification: Notification | undefined;

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
    notification = new Notification({ title: "HUHU 文档保存", body: message, silent: true });
    notification.once("show", () => {
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

export function takeExitSaveFeedback(vaultRoot: string): ExitSaveSummary | null {
  try {
    const file = receiptFile(vaultRoot);
    const receipt = readReceipt(file);
    if (!receipt) return null;
    rmSync(file, { force: true });
    return { files: receipt.files, drafts: receipt.drafts };
  } catch {
    return null;
  }
}
