import { once } from "node:events";
import { createServer, type Socket } from "node:net";
import { assert } from "vitest";

export type SmtpMode = "accept" | "reject-data" | "lose-reply" | "reject-rcpt" | "partial";
type Data = { sender: string; recipients: string[]; wire: string };

// Adapted from the S0.2 loopback-only protocol probe. Only mail commands and DATA are recorded.
export async function loopbackSmtp(password: string) {
  const sockets = new Set<Socket>();
  const messages: Data[] = [];
  const counts = { connections: 0, authenticated: 0, data: 0 };
  let mode: SmtpMode = "accept";
  let beforeReply: ((message: Data) => Promise<void>) | undefined;
  const server = createServer((socket) => {
    sockets.add(socket);
    counts.connections++;
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setTimeout(6_000, () => socket.destroy());
    socket.setEncoding("utf8");
    socket.write("220 localhost ESMTP fixture\r\n");
    let buffer = "";
    let sender = "";
    const recipients: string[] = [];
    let data: string[] | undefined;
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const reply = (message: string) => socket.write(`${message}\r\n`);
        if (data) {
          if (line !== ".") {
            data.push(line.startsWith("..") ? line.slice(1) : line);
            continue;
          }
          const message = { sender, recipients: [...recipients], wire: data.join("\r\n") };
          messages.push(message);
          data = undefined;
          const completed = mode;
          void Promise.resolve(beforeReply?.(message)).then(
            () => {
              if (completed === "lose-reply") socket.destroy();
              else if (!socket.destroyed) reply(completed === "reject-data" ? "554 5.6.0 fixture rejected DATA" : "250 2.0.0 fixture queued");
            },
            () => socket.destroy(),
          );
        } else if (line.startsWith("EHLO ")) {
          reply("250-localhost\r\n250 AUTH PLAIN");
        } else if (line.startsWith("AUTH PLAIN ")) {
          const auth = Buffer.from(line.slice("AUTH PLAIN ".length), "base64").toString("utf8").split("\0");
          if (auth[2] !== password || !auth[1]?.endsWith("@example.invalid")) reply("535 invalid fixture credentials");
          else {
            counts.authenticated++;
            reply("235 authentication successful");
          }
        } else if (line.startsWith("MAIL FROM:")) {
          sender = line.match(/<([^>]+)>/)?.[1] ?? "";
          reply("250 sender OK");
        } else if (line.startsWith("RCPT TO:")) {
          const address = line.match(/<([^>]+)>/)?.[1] ?? "";
          if (mode === "reject-rcpt" || (mode === "partial" && address.startsWith("refused@"))) reply("550 5.1.1 recipient refused");
          else {
            recipients.push(address);
            reply("250 recipient OK");
          }
        } else if (line === "DATA") {
          counts.data++;
          data = [];
          reply("354 start mail input");
        } else if (line === "QUIT") {
          socket.end("221 bye\r\n");
        } else reply("500 unsupported fixture command");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const bound = server.address();
  assert(bound && typeof bound !== "string");
  return {
    port: bound.port,
    counts,
    messages,
    configure(nextMode: SmtpMode, onData?: (message: Data) => Promise<void>) {
      mode = nextMode;
      beforeReply = onData;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
