import MailComposer from "nodemailer/lib/mail-composer";
import { graphErrorCode, graphRequest } from "./graph-mail.js";
import { uniformOutcome, type MailSmtpMessage, type MailSmtpResult } from "./smtp.js";

export async function sendGraphMail(endpoint: string, token: string, message: MailSmtpMessage, signal: AbortSignal, assertCurrent: () => void): Promise<MailSmtpResult> {
  const addresses = [...message.to, ...message.cc, ...message.bcc];
  let body: string;
  try {
    signal.throwIfAborted();
    const mime = new MailComposer({ ...message, disableFileAccess: true, disableUrlAccess: true }).compile();
    // SMTP carries Bcc in the envelope. Graph needs the Bcc header in the submitted MIME to build its envelope.
    mime.keepBcc = true;
    body = (await mime.build()).toString("base64");
    signal.throwIfAborted();
  } catch {
    return uniformOutcome(addresses, "prepare", "not-delivered");
  }
  assertCurrent();
  try {
    const response = await graphRequest(new URL(`${endpoint}/sendMail`), token, signal, { method: "POST", body, headers: { "Content-Type": "text/plain" } });
    const graphStatus = response.status;
    const code = graphStatus === 403 ? await graphErrorCode(response) : undefined;
    await response.body?.cancel().catch(() => undefined);
    if (graphStatus === 202) return { stage: "data", graphStatus, recipients: addresses.map((address) => ({ address, state: "accepted" })) };
    if ([400, 401, 403, 413, 415, 429].includes(graphStatus)) {
      return { ...uniformOutcome(addresses, "data", "not-delivered"), graphStatus, ...(code && { graphErrorCode: code }) };
    }
    return { ...uniformOutcome(addresses, "data", "unknown"), graphStatus };
  } catch {
    // Loss of the HTTP acknowledgment can follow acceptance. Do not retry automatically.
    return uniformOutcome(addresses, "data", "unknown");
  }
}
