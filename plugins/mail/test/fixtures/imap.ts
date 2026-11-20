import { createServer, type Socket } from "node:net";
import { createInterface } from "node:readline";

/** Folder discovery adaptation of the S0.2 synthetic IMAP endpoint. */
export async function openImapFixture(
  options: {
    stallList?: boolean;
    rejectLogin?: boolean;
    rejectList?: boolean;
    disconnectDuringList?: boolean;
    namespacedInbox?: "selectable" | "missing" | "noselect" | "nonexistent";
    message?: { uidValidity: number; subject: string; source: string };
  } = {},
) {
  const commands: string[] = [];
  const listRequests: string[] = [];
  const fetchRequests: string[] = [];
  const sockets = new Set<Socket>();
  const listed = Promise.withResolvers<void>();
  const disconnected = Promise.withResolvers<void>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => {
      sockets.delete(socket);
      if (sockets.size === 0) disconnected.resolve();
    });
    socket.write("* OK [CAPABILITY IMAP4rev1 NAMESPACE] loopback fixture\r\n");
    createInterface({ input: socket, crlfDelay: Infinity }).on("line", (line) => {
      const [tag, verb] = line.split(" ", 2);
      const command = verb?.toUpperCase();
      if (!command) return socket.destroy();
      commands.push(command);
      switch (command) {
        case "CAPABILITY":
          return socket.write(`* CAPABILITY IMAP4rev1 NAMESPACE\r\n${tag} OK CAPABILITY\r\n`);
        case "LOGIN":
          return socket.write(options.rejectLogin ? `${tag} NO [AUTHENTICATIONFAILED] denied\r\n` : `${tag} OK LOGIN\r\n`);
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
          return socket.write(['* LIST (\\HasNoChildren) "/" "inbox"', '* LIST (\\Noselect \\HasChildren) "/" "Container"', '* LIST (\\HasNoChildren) "/" "Container/Projects"', `${tag} OK LIST`, ""].join("\r\n"));
        }
        case "LSUB":
          return socket.write(`${tag} OK LSUB\r\n`);
        case "EXAMINE": {
          const message = options.message;
          if (!message) return socket.write(`${tag} BAD mailbox not configured\r\n`);
          return socket.write(`* FLAGS (\\Seen)\r\n* 1 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY ${message.uidValidity}] stable\r\n* OK [UIDNEXT 43] next\r\n${tag} OK [READ-ONLY] examine\r\n`);
        }
        case "FETCH": {
          const message = options.message;
          if (!message) return socket.write(`${tag} BAD message not configured\r\n`);
          fetchRequests.push(line);
          const size = Buffer.byteLength(message.source);
          return socket.write(`* 1 FETCH (UID 42 RFC822.SIZE ${size} ENVELOPE (NIL "${message.subject}" NIL NIL NIL NIL NIL NIL NIL NIL))\r\n${tag} OK FETCH\r\n`);
        }
        case "UID": {
          const message = options.message;
          if (!message || !/UID FETCH 42 .*BODY\.PEEK\[\]/i.test(line)) return socket.write(`${tag} BAD unsupported UID command\r\n`);
          fetchRequests.push(line);
          socket.write(`* 1 FETCH (UID 42 BODY[]<0> {${Buffer.byteLength(message.source)}}\r\n`);
          socket.write(message.source);
          return socket.write(`)\r\n${tag} OK UID FETCH\r\n`);
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
    listed: listed.promise,
    disconnected: disconnected.promise,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
