import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { PrivateMailAttachmentRequest, SelectDraftAttachmentResult } from "@huhu/plugin-mail/desktop-attachments";
import { createMailOAuth } from "@huhu/plugin-mail/engine";
import { boot } from "./boot.js";

interface AttachmentReplyPort {
  on(event: "close", cb: () => void): void;
  start(): void;
  close(): void;
  postMessage(result: SelectDraftAttachmentResult): void;
}

interface ParentPort {
  postMessage(m: unknown): void;
  on(event: "message", cb: (e: { data?: { type?: string } | PrivateMailAttachmentRequest; ports?: AttachmentReplyPort[] }) => void): void;
}

function mailOAuthWithBrowser(port: ParentPort) {
  const googleId = process.env["HUHU_MAIL_GOOGLE_CLIENT_ID"]?.trim();
  const googleSecret = process.env["HUHU_MAIL_GOOGLE_CLIENT_SECRET"];
  delete process.env["HUHU_MAIL_GOOGLE_CLIENT_SECRET"];
  const microsoftId = process.env["HUHU_MAIL_MICROSOFT_CLIENT_ID"]?.trim();
  if (!googleId && !microsoftId) return {};
  const pending = new Map<string, (opened: boolean) => void>();
  port.on("message", ({ data }) => {
    if (data?.type !== "mail-oauth:opened") return;
    const { id, opened } = data as { id?: unknown; opened?: unknown };
    if (typeof id === "string" && typeof opened === "boolean") pending.get(id)?.(opened);
  });
  return {
    mailOAuth: createMailOAuth(
      { ...(googleId && { google: { clientId: googleId, ...(googleSecret && { clientSecret: googleSecret }) } }), ...(microsoftId && { microsoft: { clientId: microsoftId } }) },
      {
        hostLabel: hostname(),
        openBrowser: (url) =>
          new Promise<void>((resolve, reject) => {
            const id = randomUUID();
            const finish = (opened: boolean) => {
              clearTimeout(deadline);
              pending.delete(id);
              if (opened) resolve();
              else reject(new Error("System browser unavailable"));
            };
            const deadline = setTimeout(() => finish(false), 5_000);
            pending.set(id, finish);
            try {
              port.postMessage({ type: "mail-oauth:open", id, url });
            } catch {
              finish(false);
            }
          }),
      },
    ),
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Engine 入口：`--vault <path> [--create] [--idle-exit-ms N]`。就绪后向父进程/标准输出报告端口与令牌。 */
async function main(): Promise<void> {
  const vaultPath = arg("--vault");
  if (!vaultPath) {
    console.error("缺少 --vault");
    process.exit(2);
  }
  const idle = Number(arg("--idle-exit-ms") ?? 0);
  const webAssetsDir = process.env["HUHU_WEB_ASSETS_DIR"];
  const desktopUserData = process.env["HUHU_DESKTOP_USER_DATA"];
  // 启动期间收到的关闭请求不能丢：boot 完成后立刻关闭
  let stopRequested = false;
  let stopNow: (() => void) | null = null;
  const requestStop = () => (stopNow ? stopNow() : void (stopRequested = true));
  process.on("message", (m) => {
    if ((m as { type?: string }).type === "shutdown") requestStop();
  });
  const earlyPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
  earlyPort?.on("message", (e) => {
    if (e.data?.type === "shutdown") requestStop();
  });
  const engine = await boot({
    vaultPath,
    create: process.argv.includes("--create"),
    readOnly: process.argv.includes("--read-only"),
    idleExitMs: idle,
    ...(webAssetsDir ? { webAssetsDir } : {}),
    ...(desktopUserData ? { desktopUserData } : {}),
    ...(earlyPort ? mailOAuthWithBrowser(earlyPort) : {}),
  });
  // Renderer 令牌只经 IPC 通道交给 Main；独立运行（无 IPC）时不输出任何令牌
  const ready = { type: "ready", port: engine.port, rendererToken: engine.rendererToken, vaultId: engine.vault.id };
  const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort; // Electron utilityProcess
  parentPort?.on("message", ({ data, ports }) => {
    if (data?.type !== "mail-attachment:add" || ports?.length !== 1) return;
    const port = ports[0]!;
    const controller = new AbortController();
    port.on("close", () => controller.abort());
    port.start();
    void Promise.resolve()
      .then(() => engine.addMailDraftAttachment(data as PrivateMailAttachmentRequest, controller.signal))
      .catch((): SelectDraftAttachmentResult => ({ status: "failed", reason: "failed" }))
      .then((result) => {
        if (!controller.signal.aborted) port.postMessage(result);
        port.close();
      });
  });
  if (parentPort) parentPort.postMessage(ready);
  else if (process.send) process.send(ready);
  else process.stdout.write(JSON.stringify({ type: "ready", port: engine.port, vaultId: engine.vault.id }) + "\n");

  const stop = async () => {
    const timer = setTimeout(() => process.exit(1), 15_000);
    await engine.shutdown();
    clearTimeout(timer);
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
  stopNow = () => void stop();
  if (stopRequested) stopNow();

  if (idle > 0) {
    let last = Date.now();
    engine.events.subscribe(() => (last = Date.now()));
    const t = setInterval(
      () => {
        if (engine.server.activeConnections() === 0 && Date.now() - Math.max(last, engine.server.lastActivity()) > idle) {
          clearInterval(t);
          void stop();
        }
      },
      Math.min(1000, idle),
    );
  }
}

main().catch((e) => {
  const err = e as { code?: string; message?: string };
  process.stderr.write(JSON.stringify({ type: "error", code: err.code ?? "INTERNAL", message: err.message ?? String(e) }) + "\n");
  process.exit(1);
});
