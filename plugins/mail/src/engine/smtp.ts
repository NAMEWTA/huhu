import { Readable } from "node:stream";
import XOAuth2 from "nodemailer/lib/xoauth2";
import { z } from "zod";
import type { MailEndpoint } from "./presets.js";

const smtpCode = z.number().int().min(200).max(599);
const recipientResult = z.strictObject({ address: z.email(), state: z.enum(["accepted", "not-delivered", "unknown"]), smtpCode: smtpCode.optional() });
export const smtpResultSchema = z
  .strictObject({
    stage: z.enum(["prepare", "credential", "connect", "auth", "envelope", "data"]),
    smtpCode: smtpCode.optional(),
    graphStatus: z.int().min(200).max(599).optional(),
    graphErrorCode: z
      .string()
      .regex(/^[A-Za-z0-9_.-]{1,120}$/)
      .optional(),
    reason: z.literal("graph-send-permission").optional(),
    recipients: z.array(recipientResult).min(1).max(3_000),
  })
  .refine(({ stage, smtpCode, graphStatus, recipients }) => !recipients.some(({ state }) => state === "accepted") || (stage === "data" && ((smtpCode !== undefined && smtpCode < 300) || graphStatus === 202)));
export type MailSmtpResult = z.infer<typeof smtpResultSchema>;

type MessageAttachment = { filename: string; content: Buffer };
export type MailSmtpMessage = {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  date: string;
  attachments: MessageAttachment[];
};
export type MailSmtpTransport = (endpoint: MailEndpoint, password: string, message: MailSmtpMessage, signal: AbortSignal, auth?: "oauth2") => Promise<MailSmtpResult>;

type SmtpError = Error & { command?: string | undefined; responseCode?: number | undefined; rejectedErrors?: { recipient?: string | undefined; responseCode?: number | undefined }[] | undefined };
type SmtpInfo = { accepted: string[]; rejected: string[]; rejectedErrors?: SmtpError["rejectedErrors"]; response: string };

// Assembly supplies Nodemailer 10.6.0's public smtp-connection and mail-composer exports.
export interface NodemailerSmtpModules {
  SMTPConnection: new (options: MailEndpointOptions) => {
    on(event: "error", listener: (error: Error) => void): void;
    connect(callback: (error?: SmtpError) => void): void;
    login(auth: { user: string; pass: string } | { user: string; method: "XOAUTH2"; oauth2: XOAuth2 }, callback: (error: SmtpError | null) => void): void;
    send(envelope: { from: string; to: string[]; size: number }, message: Readable, callback: (error: SmtpError | null, info: SmtpInfo) => void): void;
    close(): void;
  };
  MailComposer: new (message: Omit<MailSmtpMessage, "bcc"> & { disableFileAccess: true; disableUrlAccess: true }) => { compile(): { build(): Promise<Buffer> } };
}

type MailEndpointOptions = {
  host: string;
  port: number;
  secure: boolean;
  ignoreTLS: boolean;
  requireTLS: boolean;
  tls: { rejectUnauthorized: true };
  connectionTimeout: number;
  socketTimeout: number;
};

export function uniformOutcome(addresses: string[], stage: MailSmtpResult["stage"], state: "not-delivered" | "unknown"): MailSmtpResult {
  return { stage, recipients: addresses.map((address) => ({ address, state })) };
}

export function createMailSmtpTransport({ SMTPConnection, MailComposer }: NodemailerSmtpModules): MailSmtpTransport {
  return async (endpoint, password, message, signal, auth) => {
    const { bcc, ...publicMessage } = message;
    const addresses = [...message.to, ...message.cc, ...bcc];
    let wire: Buffer;
    try {
      signal.throwIfAborted();
      wire = await new MailComposer({ ...publicMessage, disableFileAccess: true, disableUrlAccess: true }).compile().build();
      signal.throwIfAborted();
    } catch {
      return uniformOutcome(addresses, "prepare", "not-delivered");
    }
    const connection = new SMTPConnection({
      host: endpoint.host,
      port: endpoint.port,
      secure: endpoint.security === "tls",
      ignoreTLS: endpoint.security === "none",
      requireTLS: endpoint.security === "starttls",
      tls: { rejectUnauthorized: true },
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
    let rejectConnection!: (reason: unknown) => void;
    const failed = new Promise<never>((_resolve, reject) => {
      rejectConnection = reject;
    });
    const abort = () => rejectConnection(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    connection.on("error", rejectConnection);
    let stage: MailSmtpResult["stage"] = "connect";
    let beganData = false;
    try {
      signal.throwIfAborted();
      await Promise.race([failed, new Promise<void>((resolve, reject) => connection.connect((error) => (error ? reject(error) : resolve())))]);
      signal.throwIfAborted();
      stage = "auth";
      const login = auth === "oauth2" ? { user: message.from, method: "XOAUTH2" as const, oauth2: new XOAuth2({ user: message.from, accessToken: password }) } : { user: message.from, pass: password };
      await Promise.race([failed, new Promise<void>((resolve, reject) => connection.login(login, (error) => (error ? reject(error) : resolve())))]);
      signal.throwIfAborted();
      stage = "envelope";
      const stream = Readable.from(
        (function* () {
          beganData = true;
          yield wire;
        })(),
      );
      const result = await Promise.race([failed, new Promise<SmtpInfo>((resolve, reject) => connection.send({ from: message.from, to: addresses, size: wire.length }, stream, (error, info) => (error ? reject(error) : resolve(info))))]);
      const code = Number(result.response.match(/^2\d{2}(?=[ -]|$)/)?.[0]);
      if (!code) return uniformOutcome(addresses, "data", "unknown");
      const accepted = new Set(result.accepted);
      const rejected = new Set(result.rejected);
      const rejectionCodes = new Map(result.rejectedErrors?.map(({ recipient, responseCode }) => [recipient, responseCode] as const));
      return {
        stage: "data",
        smtpCode: code,
        recipients: addresses.map((address) => {
          if (accepted.has(address)) return { address, state: "accepted", smtpCode: code };
          if (rejected.has(address)) return { address, state: "not-delivered", smtpCode: rejectionCodes.get(address) };
          return { address, state: "unknown" };
        }),
      };
    } catch (error) {
      const problem = error as SmtpError | undefined;
      const code = problem?.responseCode;
      const rejected = code !== undefined && code >= 400 && code <= 599;
      // A generic connection failure after starting DATA does not establish SMTP's final reply.
      const finalRejection = rejected && problem?.command === "DATA";
      const result = uniformOutcome(addresses, beganData || finalRejection ? "data" : stage, beganData && !finalRejection ? "unknown" : "not-delivered");
      const rejectionCodes = new Map(problem?.rejectedErrors?.map(({ recipient, responseCode }) => [recipient, responseCode]));
      if (rejected && result.recipients.every(({ state }) => state === "not-delivered")) result.smtpCode = code;
      for (const recipient of result.recipients) {
        const refusal = rejectionCodes.get(recipient.address);
        if (refusal !== undefined && refusal >= 400 && refusal <= 599) {
          recipient.state = "not-delivered";
          recipient.smtpCode = refusal;
        } else if (recipient.state === "not-delivered" && rejected) {
          recipient.smtpCode = code;
        }
      }
      return result;
    } finally {
      signal.removeEventListener("abort", abort);
      connection.close();
    }
  };
}
