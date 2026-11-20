import type { MailFolderDiscovery } from "./discovery.js";
import { withImapConnection } from "./imap-connection.js";

export const discoverImapFolders: MailFolderDiscovery = (request) =>
  withImapConnection(request, "discovery-stale", "folder-list", async (client) => {
    // ImapFlow's full listing probes INBOX separately when the namespace listing omits it.
    const folders = await client.list({ listOnly: !client.namespace?.prefix });
    return folders.map(({ path, name, delimiter, specialUse, flags }) => ({ path, name, delimiter: delimiter || null, specialUse: specialUse ?? null, flags: [...flags] }));
  });
