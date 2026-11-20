import { createServer, type Socket } from "node:net";
import { createInterface } from "node:readline";

/** Folder discovery adaptation of the S0.2 synthetic IMAP endpoint. */
export async function openImapFixture(options: { stallList?: boolean; rejectLogin?: boolean; rejectList?: boolean; disconnectDuringList?: boolean; namespacedInbox?: "selectable" | "missing" | "noselect" | "nonexistent" } = {}) {
  const commands: string[] = [];
  const listRequests: string[] = [];
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
    listed: listed.promise,
    disconnected: disconnected.promise,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
