import { createServer, type Socket } from "node:net";
import { createInterface } from "node:readline";

export type FixtureImapMessage = { uidValidity: number; uid?: number; subject: string; source: string; seen?: boolean; deleted?: boolean; refuseRead?: boolean; ignoreRead?: boolean };

/** Folder discovery adaptation of the S0.2 synthetic IMAP endpoint. */
export async function openImapFixture(
  options: {
    stallList?: boolean;
    rejectLogin?: boolean;
    acceptPassword?: (value: string) => boolean;
    acceptOAuth?: (email: string, token: string) => boolean;
    rejectList?: boolean;
    disconnectDuringList?: boolean;
    namespacedInbox?: "selectable" | "missing" | "noselect" | "nonexistent";
    beforeSource?: (uid: number) => Promise<void>;
    message?: FixtureImapMessage;
    mailboxes?: Record<string, FixtureImapMessage>;
    windows?: Record<string, { uidValidity: number; messages: FixtureImapMessage[] }>;
    reverseFetch?: boolean;
    allowIdle?: boolean;
    folders?: { path: string; flags: string[] }[];
  } = {},
) {
  const commands: string[] = [];
  const listRequests: string[] = [];
  const fetchRequests: string[] = [];
  const storeRequests: string[] = [];
  const sockets = new Set<Socket>();
  const idleSockets = new Set<Socket>();
  const listed = Promise.withResolvers<void>();
  const disconnected = Promise.withResolvers<void>();
  const server = createServer((socket) => {
    let selected = "INBOX";
    const uidOf = (message: FixtureImapMessage) => message.uid ?? 42;
    const current = () => {
      const box = options.windows?.[selected];
      if (box) return { ...box, messages: [...box.messages].sort((a, b) => uidOf(a) - uidOf(b)) };
      const message = options.mailboxes ? options.mailboxes[selected] : options.message;
      return message ? { uidValidity: message.uidValidity, messages: [message] } : undefined;
    };
    const flags = (message: FixtureImapMessage) => [message.seen && "\\Seen", message.deleted && "\\Deleted"].filter(Boolean).join(" ");
    const inRange = (value: number, range: string, max: number) =>
      range.split(",").some((part) => {
        const [start, end = start] = part.split(":").map((item) => (item === "*" ? max : Number(item)));
        return start !== undefined && end !== undefined && value >= Math.min(start, end) && value <= Math.max(start, end);
      });
    function headers(tag: string, messages: FixtureImapMessage[], range: string, byUid: boolean) {
      const rows = messages.map((message, index) => ({ message, seq: index + 1 })).filter(({ message, seq }) => inRange(byUid ? uidOf(message) : seq, range, byUid && messages.length ? uidOf(messages.at(-1)!) : messages.length));
      if (options.reverseFetch) rows.reverse();
      return socket.write(
        rows.map(({ message, seq }) => `* ${seq} FETCH (UID ${uidOf(message)} FLAGS (${flags(message)}) RFC822.SIZE ${Buffer.byteLength(message.source)} ENVELOPE (NIL "${message.subject}" NIL NIL NIL NIL NIL NIL NIL NIL))\r\n`).join("") +
          `${tag} OK FETCH\r\n`,
      );
    }
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => {
      idleSockets.delete(socket);
      sockets.delete(socket);
      if (sockets.size === 0) disconnected.resolve();
    });
    const capabilities = () => `IMAP4rev1 NAMESPACE${options.allowIdle ? " IDLE" : ""}${options.acceptOAuth ? " AUTH=XOAUTH2 SASL-IR" : ""}`;
    socket.write(`* OK [CAPABILITY ${capabilities()}] loopback fixture\r\n`);
    createInterface({ input: socket, crlfDelay: Infinity }).on("line", (line) => {
      const [tag, verb] = line.split(" ", 2);
      const command = verb?.toUpperCase();
      if (!command) return socket.destroy();
      commands.push(command);
      switch (command) {
        case "CAPABILITY":
          return socket.write(`* CAPABILITY ${capabilities()}\r\n${tag} OK CAPABILITY\r\n`);
        case "IDLE":
          if (!options.allowIdle) return socket.write(`${tag} BAD IDLE unsupported\r\n`);
          idleSockets.add(socket);
          return socket.write("+ idling\r\n");
        case "LOGIN": {
          const supplied = line.match(/(?:"([a-z0-9-]+)"|([a-z0-9-]+))$/i);
          const rejected = options.rejectLogin || (options.acceptPassword && !options.acceptPassword(supplied?.[1] ?? supplied?.[2] ?? ""));
          return socket.write(rejected ? `${tag} NO [AUTHENTICATIONFAILED] denied\r\n` : `${tag} OK LOGIN\r\n`);
        }
        case "AUTHENTICATE": {
          const [, , method, encoded] = line.split(" ");
          const decoded = Buffer.from(encoded ?? "", "base64").toString("utf8");
          const [user, authorization, tail] = decoded.split("\x01", 3);
          const accepted = method === "XOAUTH2" && user?.startsWith("user=") && authorization?.startsWith("auth=Bearer ") && tail === "" && decoded.endsWith("\x01\x01") && options.acceptOAuth?.(user.slice(5), authorization.slice(12));
          return socket.write(accepted ? `${tag} OK AUTHENTICATE\r\n` : `${tag} NO [AUTHENTICATIONFAILED] denied\r\n`);
        }
        case "NAMESPACE":
          if (options.namespacedInbox) return socket.write(`* NAMESPACE (("INBOX." ".")) NIL NIL\r\n${tag} OK NAMESPACE\r\n`);
          return socket.write(`* NAMESPACE (("" "/")) NIL NIL\r\n${tag} OK NAMESPACE\r\n`);
        case "LIST": {
          const request = line.slice(`${tag} ${verb} `.length);
          listRequests.push(request);
          listed.resolve();
          if (options.stallList) return;
          if (options.disconnectDuringList) return socket.destroy();
          if (options.rejectList) return socket.write(`${tag} NO listing unavailable\r\n`);
          if (options.namespacedInbox) {
            if (request === '"INBOX." "*"') return socket.write(`* LIST (\\HasNoChildren) "." "INBOX.Projects"\r\n${tag} OK LIST\r\n`);
            if (request !== '"" "INBOX"') return socket.write(`${tag} BAD unexpected LIST request\r\n`);
            const inboxFlags = { selectable: "\\HasChildren", missing: "", noselect: "\\Noselect", nonexistent: "\\NonExistent" }[options.namespacedInbox];
            const response = inboxFlags ? `* LIST (${inboxFlags}) "." "inbox"\r\n` : "";
            return socket.write(`${response}${tag} OK LIST\r\n`);
          }
          const folders = options.folders?.map(({ path, flags }) => `* LIST (${flags.join(" ")}) "/" "${path}"`) ?? [
            '* LIST (\\HasNoChildren) "/" "inbox"',
            '* LIST (\\Noselect \\HasChildren) "/" "Container"',
            '* LIST (\\HasNoChildren) "/" "Container/Projects"',
          ];
          return socket.write([...folders, `${tag} OK LIST`, ""].join("\r\n"));
        }
        case "LSUB":
          return socket.write(`${tag} OK LSUB\r\n`);
        case "EXAMINE":
        case "SELECT": {
          selected = line.slice(`${tag} ${verb} `.length).trim().replace(/^"|"$/g, "");
          const box = current();
          if (!box) return socket.write(`${tag} BAD mailbox not configured\r\n`);
          const mode = command === "SELECT" ? "READ-WRITE" : "READ-ONLY";
          const next = box.messages.at(-1);
          return socket.write(
            `* FLAGS (\\Seen \\Deleted)\r\n* ${box.messages.length} EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY ${box.uidValidity}] stable\r\n* OK [UIDNEXT ${next ? uidOf(next) + 1 : 1}] next\r\n${tag} OK [${mode}] mailbox selected\r\n`,
          );
        }
        case "FETCH": {
          const box = current();
          if (!box) return socket.write(`${tag} BAD message not configured\r\n`);
          fetchRequests.push(line);
          return headers(tag!, box.messages, line.split(" ")[2] ?? "*", false);
        }
        case "UID": {
          const box = current();
          if (!box) return socket.write(`${tag} BAD unsupported UID command\r\n`);
          const range = line.split(" ")[3] ?? "";
          if (/\bUID FETCH\b/i.test(line) && /\bFLAGS\b/i.test(line) && !/BODY\.PEEK/i.test(line)) {
            fetchRequests.push(line);
            return headers(tag!, box.messages, range, true);
          }
          const message = box.messages.find((item) => uidOf(item) === Number(range));
          if (!message) return socket.write(`${tag} BAD unsupported UID command\r\n`);
          const uid = uidOf(message);
          if (line.toUpperCase().includes(`UID STORE ${uid} `) && /\+FLAGS(?:\.SILENT)? \(\\Seen\)/i.test(line)) {
            storeRequests.push(line);
            if (message.refuseRead) return socket.write(`${tag} NO read update denied\r\n`);
            if (!message.ignoreRead) message.seen = true;
            return socket.write(`${tag} OK STORE\r\n`);
          }
          const matchingFetch = line.toUpperCase().includes(`UID FETCH ${uid} `);
          if (!matchingFetch || !/BODY\.PEEK\[\]/i.test(line)) return socket.write(`${tag} BAD unsupported UID command\r\n`);
          fetchRequests.push(line);
          const send = () => {
            if (socket.destroyed) return;
            socket.write(`* ${box.messages.indexOf(message) + 1} FETCH (UID ${uid} BODY[]<0> {${Buffer.byteLength(message.source)}}\r\n`);
            socket.write(message.source);
            socket.write(`)\r\n${tag} OK UID FETCH\r\n`);
          };
          if (!options.beforeSource) return send();
          void options.beforeSource(uid).then(send, () => socket.destroy());
          return;
        }
        default:
          return socket.write(`${tag} BAD unsupported fixture command\r\n`);
      }
    });
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("loopback listener unavailable"));
      resolve(address.port);
    });
  });
  return {
    port,
    commands,
    listRequests,
    fetchRequests,
    storeRequests,
    listed: listed.promise,
    disconnected: disconnected.promise,
    idleCount: () => idleSockets.size,
    announceExists(count: number) {
      for (const socket of idleSockets) socket.write(`* ${count} EXISTS\r\n`);
    },
    disconnectIdle() {
      for (const socket of idleSockets) socket.destroy();
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
