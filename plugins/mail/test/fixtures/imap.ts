import { createServer, type Socket } from "node:net";
import { createInterface } from "node:readline";

/** LIST-only adaptation of the S0.2 synthetic IMAP endpoint. */
export async function openImapFixture(options: { stallList?: boolean; rejectLogin?: boolean; rejectList?: boolean; disconnectDuringList?: boolean } = {}) {
  const commands: string[] = [];
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
          return socket.write(`* NAMESPACE (("" "/")) NIL NIL\r\n${tag} OK NAMESPACE\r\n`);
        case "LIST":
          listed.resolve();
          if (options.stallList) return;
          if (options.disconnectDuringList) return socket.destroy();
          if (options.rejectList) return socket.write(`${tag} NO listing unavailable\r\n`);
          return socket.write(['* LIST (\\HasNoChildren) "/" "inbox"', '* LIST (\\Noselect \\HasChildren) "/" "Container"', '* LIST (\\HasNoChildren) "/" "Container/Projects"', `${tag} OK LIST`, ""].join("\r\n"));
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
    listed: listed.promise,
    disconnected: disconnected.promise,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
