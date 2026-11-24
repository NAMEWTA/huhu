import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { assert, expect, test as engineTest, vi } from "vitest";
import { boot, type RunningEngine } from "./fixtures/engine.js";
import { accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { openMailAccounts } from "../src/engine/accounts.js";
import type { ConversationMessagesPage, ConversationsPage, LocatedMessage, MailSearchPage } from "../src/engine/conversations.js";
import { mailDayWindow } from "../src/mail-calendar.js";
import { operationIdFor, OutboxStorage, retryOperationIdFor, retryRecipientKey } from "../src/engine/outbox-storage.js";
import type { MailSmtpResult } from "../src/engine/smtp.js";
import { openImapFixture, type FixtureImapMessage } from "./fixtures/imap.js";
import { loopbackSmtp } from "./fixtures/smtp.js";

engineTest(
  "真实 IMAP 缓存先归并再分页，保持公开联系人和原来源且零 SMTP",
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-conversations-"));
    const vaultPath = path.join(root, "vault");
    const desktopUserData = path.join(root, "app");
    mkdirSync(vaultPath);
    mkdirSync(desktopUserData);
    const aEmail = "first@example.invalid";
    const bEmail = "second@example.invalid";
    const alice = "alice@example.invalid";
    const bob = "bob@example.invalid";
    const carla = "carla@example.invalid";
    const blind = "private@example.invalid";
    const hidden = "hidden-copy@example.invalid";
    const sharedId = "<well-formed-shared@example.invalid>";
    const mirroredId = `<${randomUUID()}@huhu.local>`;
    const password = `synthetic-${randomUUID()}`;
    const fixtureMail = (subject: string, uid: number, day: number, headers: string[], id?: string): FixtureImapMessage => ({
      uidValidity: 12,
      uid,
      subject,
      source: [...headers, ...(id ? [`Message-ID: ${id}`] : []), `Date: ${new Date(Date.UTC(2026, 10, day)).toUTCString()}`, `Subject: ${subject}`, "", `Body for ${subject}`, ""].join("\r\n"),
    });
    const mailboxes = {
      INBOX: fixtureMail("A canonical", 42, 1, [`From: Alice <${alice.toUpperCase()}>`, `To: ${aEmail}, ${bEmail}`], sharedId),
      Archive: fixtureMail("A duplicate", 42, 1, [`From: ${alice}`, `To: ${aEmail}`, `Cc: ${bob}`, `Bcc: ${blind}`], sharedId),
      Waste: fixtureMail("Hidden duplicate", 42, 20, [`From: ${hidden}`, `To: ${aEmail}`], sharedId),
      Junk: fixtureMail("Remote junk", 42, 23, [`From: ${hidden}`, `To: ${aEmail}`]),
      Sent: fixtureMail("Mirrored sent body", 42, 6, [`From: ${aEmail}`, `To: ${alice}`, `Bcc: ${blind}`], mirroredId),
      Drafts: fixtureMail("Remote draft", 42, 21, [`From: ${aEmail}`, `To: ${hidden}`]),
      Confidential: fixtureMail("Hidden flagged folder", 42, 22, [`From: ${hidden}`, `To: ${aEmail}`]),
    };
    const folders = Object.keys(mailboxes).map((path) => ({ path, flags: ["\\HasNoChildren", ...(path === "Waste" ? ["\\Trash"] : path === "Sent" ? ["\\Sent"] : path === "Confidential" ? ["\\Hidden"] : [])] }));
    const inbox = { uidValidity: 12, messages: [mailboxes.INBOX] };
    const sentWindow = { uidValidity: 12, messages: [mailboxes.Sent] };
    const imapA = await openImapFixture({ mailboxes, windows: { INBOX: inbox, Sent: sentWindow }, folders });
    const bSource = fixtureMail("B canonical", 42, 3, [`From: Beta Sender <${alice}>`, `To: ${bEmail}`, `Cc: ${bob}`, "Content-Type: text/html; charset=utf-8"], sharedId);
    bSource.source = bSource.source.replace("Body for B canonical", '<p>Body for B canonical, blue folder &amp; text.</p><script>blocked-search-script</script><img src="https://never-fetch.invalid/pixel">');
    const imapB = await openImapFixture({ message: bSource });
    const smtp = await loopbackSmtp(password);
    let engine: RunningEngine | undefined;

    async function call<T = unknown>(capability: string, input: unknown = {}): Promise<T> {
      assert(engine);
      const id = randomUUID();
      const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: id, idempotencyKey: id }),
      });
      const result = CapabilityResultSchema.parse(await response.json());
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return result.data as T;
    }
    try {
      engine = await boot({ vaultPath, desktopUserData, create: true });
      assert(engine.moduleCredentialHost);
      const owner = openMailAccounts({ ...engine.moduleCredentialHost, vault: engine.vault });
      async function add(email: string, port: number, paths: string[]) {
        const draft = owner.begin(
          { provider: "custom_imap", email, label: email, auth: "password", imap: { host: "127.0.0.1", port, security: "none" }, smtpEnabled: true, smtp: { host: "127.0.0.1", port: smtp.port, security: "none" } },
          password,
        );
        await draft.testConnection();
        draft.selectFolders(paths);
        return (await draft.save()).accountId;
      }
      const a = await add(aEmail, imapA.port, Object.keys(mailboxes));
      const b = await add(bEmail, imapB.port, ["INBOX"]);
      expect(await call<MailSearchPage>("mail.conversations.search", { text: "alice" })).toEqual({ hits: [], total: 0, nextOffset: null, cachedMessages: 0 });
      type Location = { accountId: string; folder: string; uid: number; localMessageId: string };
      const refresh = (accountId: string, folder = "INBOX") => call<{ message: Location | null; mailboxChanged: boolean }>("mail.sync.refresh", { accountId, folder });
      const first = (await refresh(a)).message;
      const sibling = (await refresh(b)).message;
      assert(first && sibling);
      expect(first.uid).toBe(sibling.uid);
      const siblingCache = `.huhu/cache/mail/${createHash("sha256")
        .update(JSON.stringify([b, "INBOX"]))
        .digest("hex")}.json`;
      const cached = engine.vault.files.read(siblingCache);
      assert(cached);
      const {
        uidValidity,
        message: { summary, source },
      } = JSON.parse(cached.bytes.toString("utf8"));
      await engine.vault.files.write(siblingCache, Buffer.from(JSON.stringify({ format: 1, uidValidity, message: { summary, source } })), { expectedVersion: cached.version });
      const distinct = async (entry: FixtureImapMessage) => {
        inbox.messages.push(entry);
        return refresh(a);
      };
      await distinct(fixtureMail("Without ID one", 43, 4, [`From: ${alice}`, `To: ${aEmail}`, `Cc: ${bob}, ${bob.toUpperCase()}`]));
      await distinct(fixtureMail("Without ID two", 44, 5, [`From: ${bob}`, `To: ${aEmail}`, `Cc: ${alice}`, "Message-ID: <invalid@example.invalid> <also@example.invalid>"]));
      await distinct(fixtureMail("Newest contact", 45, 12, [`From: ${carla}`, `To: ${aEmail}`]));
      expect(await distinct({ ...fixtureMail("Deleted latest", 46, 13, [`From: ${hidden}`, `To: ${aEmail}`]), deleted: true })).toMatchObject({ message: { uid: 45 } });
      for (const name of Object.keys(mailboxes).filter((name) => name !== "INBOX")) await refresh(a, name);

      async function seedSent(subject: string, to: string[], cc: string[], bcc: string[], options: {
        messageId?: string;
        states?: MailSmtpResult["recipients"][number]["state"][];
        retry?: { operationId: string; messageId: string };
        draftId?: string;
      } = {}) {
        assert(engine);
        const outbox = new OutboxStorage(engine.vault.files);
        const { messageId = `<${randomUUID()}@huhu.local>`, states, retry } = options;
        const draftId = options.draftId ?? randomUUID();
        const revision = randomUUID();
        const addresses = [...to, ...cc, ...bcc];
        const operationId = retry ? retryOperationIdFor(retry.operationId, draftId, revision, addresses.map((address) => retryRecipientKey(retry.operationId, address))) : operationIdFor(draftId, revision);
        const finishedAt = "2026-11-07T00:00:00.000Z";
        await outbox.write(
          {
            format: 1,
            operationId,
            ...(retry && { retry: { parentOperationId: retry.operationId, parentMessageId: retry.messageId, originalOperationId: retry.operationId, originalMessageId: retry.messageId } }),
            draftId,
            revision,
            messageId,
            claimedAt: finishedAt,
            from: aEmail,
            auth: "password",
            smtp: { host: "127.0.0.1", port: smtp.port, security: "none" },
            draft: { accountId: a, to, cc, bcc, subject, body: { type: "doc" } },
            text: `Local body for ${subject}`,
            result: { finishedAt, stage: "data", smtpCode: 250, recipients: addresses.map((address, index) => ({ address, state: states?.[index] ?? "accepted" })) },
          },
          null,
        );
        return operationId;
      }
      await seedSent("Cached counterpart", [alice], [bob], [blind], { messageId: mirroredId });
      const sentOnly = await seedSent("Only local sent", [alice], [bob], []);
      const privateOnly = await seedSent("Exclusively Bcc", [], [], [blind]);
      await call("mail.drafts.save", { draftId: randomUUID(), expectedRevision: null, draft: { accountId: a, to: [hidden], cc: [], bcc: [], subject: "Unsent draft", body: { type: "doc" } } });
      const before = [imapA.commands.length, imapB.commands.length];
      const list = (offset: number) => call<ConversationsPage>("mail.conversations.list", { accountId: a, offset, limit: 1 });
      expect(await list(0)).toMatchObject({ total: 2, nextOffset: 1, conversations: [{ participants: [carla], count: 1, latest: { subject: "Newest contact" } }] });
      const analyzed = vi.spyOn(engine.vault.files, "read");
      const next = await list(1);
      expect(analyzed.mock.calls.map(([relative]) => relative).filter((relative) => /^\.huhu\/(?:cache\/mail|mail\/outbox)\//.test(relative))).toEqual([]);
      expect(analyzed.mock.calls.some(([relative]) => relative.startsWith(".huhu/cache/mail-projections/"))).toBe(true);
      analyzed.mockRestore();
      expect(next).toMatchObject({ total: 2, nextOffset: null, conversations: [{ participants: [alice, bob], count: 5, latest: { source: "sent", operationId: sentOnly } }] });
      const group = next.conversations[0]!;
      const all = await call<ConversationsPage>("mail.conversations.list");
      expect(all.total).toBe(2);
      const combined = all.conversations.find((item) => item.participants.length === 2);
      assert(combined);
      expect(combined.count).toBe(6);
      const both = await call<ConversationMessagesPage>("mail.conversations.messages", { conversationId: combined.conversationId });
      expect(both.messages.filter(({ subject }) => subject.endsWith("canonical"))).toMatchObject([sibling, first]);
      const page = (offset: number, accountId = a) => call<ConversationMessagesPage>("mail.conversations.messages", { accountId, conversationId: group.conversationId, offset, limit: 2 });
      const [items1, items2, items3] = await Promise.all([page(0), page(2), page(4)]);
      expect([items1.nextOffset, items2.nextOffset, items3.nextOffset]).toEqual([2, 4, null]);
      const items = [...items1.messages, ...items2.messages, ...items3.messages];
      expect(items.map(({ subject }) => subject)).toEqual(["Only local sent", "Mirrored sent body", "Without ID two", "Without ID one", "A canonical"]);
      expect(items.at(-1)).toMatchObject({ source: "imap", ...first });
      expect(await page(0, b)).toEqual({ messages: [], total: 0, nextOffset: null });
      const key = ({ accountId, folder, localMessageId }: Location) => ({ accountId, folder, localMessageId });
      expect(await call("mail.messages.loadBody", key(first))).toMatchObject({ state: "ready", body: { text: expect.stringContaining("Body for A canonical") } });
      expect(await call("mail.messages.loadBody", key(sibling))).toMatchObject({ state: "ready", body: { untrustedHtml: expect.stringContaining("Body for B canonical") } });
      expect(await call("mail.messages.loadBody", { ...key(first), accountId: b })).toEqual({ state: "needs-refresh" });
      const sent = items.find((item) => item.subject === "Mirrored sent body");
      assert(sent?.source === "imap");
      const projection = await call("mail.conversations.loadBody", key(sent));
      expect(projection).toMatchObject({ state: "ready", body: { text: expect.stringContaining("Body for Mirrored sent body") } });
      expect(JSON.stringify(projection)).not.toContain(blind);
      const raw = await call<{ source: string }>("mail.messages.loadSource", key(sent));
      expect(Buffer.from(raw.source, "base64").toString()).toContain(`Bcc: ${blind}`);
      const trashed = (await call<{ message: Location }>("mail.messages.latest", { accountId: a, folder: "Waste" })).message;
      expect(await call("mail.conversations.loadBody", key(trashed))).toEqual({ state: "needs-refresh" });
      expect(await call("mail.conversations.sentBody", { accountId: a, operationId: sentOnly })).toEqual({ text: "Local body for Only local sent" });
      await expect(call("mail.conversations.sentBody", { accountId: b, operationId: sentOnly })).rejects.toThrow("NOT_FOUND");
      await expect(call("mail.conversations.sentBody", { accountId: a, operationId: privateOnly })).rejects.toThrow("NOT_FOUND");
      expect(JSON.stringify([all, items])).not.toMatch(/private@|hidden-copy@|Unsent draft|Deleted latest|Hidden duplicate|Remote draft|Remote junk|Hidden flagged folder/);
      expect(await call("mail.outbox.status", { operationId: privateOnly })).toMatchObject({ recipients: [{ address: blind, state: "accepted" }] });
      const search = (text: string, offset = 0) => call<MailSearchPage>("mail.conversations.search", { text, offset, limit: 1 });
      const anchor = new Date("2026-11-03T23:30:00.000Z");
      const asia = { accountId: b, time: mailDayWindow("yesterday", "Asia/Taipei", anchor), text: "blue folder & text" };
      const pacific = { ...asia, time: mailDayWindow("yesterday", "America/Los_Angeles", anchor) };
      const found = await call<MailSearchPage>("mail.conversations.search", asia);
      expect(found).toMatchObject({ total: 1, hits: [{ target: { source: "imap", ...key(sibling), uid: 42, uidValidity: "12" }, excerpt: expect.stringContaining("blue folder & text") }] });
      expect(await call("mail.conversations.search", pacific)).toMatchObject({ total: 1 });
      expect(await call("mail.conversations.search", { ...pacific, time: mailDayWindow("today", "America/Los_Angeles", anchor) })).toMatchObject({ total: 0 });
      expect(await call("mail.conversations.search", { ...asia, accountId: a })).toMatchObject({ total: 0 });
      expect(await search("ALICE")).toMatchObject({ total: 6, nextOffset: 1, hits: [{ subject: "Only local sent" }] });
      expect(await search("alice", 1)).toMatchObject({ total: 6, nextOffset: 2, hits: [{ subject: "Mirrored sent body" }] });
      expect(await search("canonical", 1)).toMatchObject({ total: 2, nextOffset: null, hits: [{ target: { source: "imap", ...key(first), uid: 42, uidValidity: "12" } }] });
      expect(await search("beta sender")).toMatchObject({ total: 1, hits: [{ subject: "B canonical", senderNames: ["Beta Sender"] }] });
      for (const term of [blind, "blocked-search-script", "never-fetch.invalid", "Hidden duplicate", "does not exist"]) {
        expect(await search(term)).toMatchObject({ total: 0, cachedMessages: 7, hits: [] });
      }
      const target = found.hits[0]!.target;
      const location = await call<LocatedMessage>("mail.conversations.findMessage", { target, limit: 1 });
      expect(location).toMatchObject({ contactOffset: 0, messageOffset: 0, message: sibling });
      expect(await call("mail.conversations.findMessage", { target: { ...target, uidValidity: "99" } })).toBeNull();
      expect(await call("mail.conversations.findMessage", { target: { ...target, accountId: a } })).toBeNull();
      const oldest = (await search("A canonical")).hits[0]!.target;
      expect(await call("mail.conversations.findMessage", { target: oldest, limit: 2 })).toMatchObject({ messageOffset: 4, message: first });
      expect([imapA.commands.length, imapB.commands.length]).toEqual(before);
      expect(smtp.counts).toEqual({ connections: 0, authenticated: 0, data: 0 });

      await engine.shutdown();
      engine = await boot({ vaultPath, desktopUserData });
      expect(await page(4)).toEqual(items3);
      const restartedReads = vi.spyOn(engine.vault.files, "read");
      try {
        expect(await call<MailSearchPage>("mail.conversations.search", asia)).toMatchObject({ total: 1 });
        expect(restartedReads.mock.calls.some(([relative]) => relative === siblingCache)).toBe(false);
      } finally {
        restartedReads.mockRestore();
      }

      inbox.uidValidity = 13;
      inbox.messages = [{ ...fixtureMail("New generation", 42, 14, [`From: ${carla}`, `To: ${aEmail}`]), uidValidity: 13 }];
      expect(await refresh(a)).toMatchObject({ mailboxChanged: true });
      expect(await call("mail.messages.loadBody", key(first))).toEqual({ state: "needs-refresh" });
      expect(await call("mail.conversations.findMessage", { target: oldest })).toBeNull();
      expect(await call("mail.messages.loadBody", key(sibling))).toMatchObject({ state: "ready" });
      expect(smtp.counts.data).toBe(0);

      const accepted = "accepted@example.invalid";
      const declined = "declined@example.invalid";
      const unknown = "uncertain@example.invalid";
      const onlyBlind = "blind-public-intent@example.invalid";
      const mixedId = `<${randomUUID()}@huhu.local>`;
      const blindId = `<${randomUUID()}@huhu.local>`;
      const uncertainId = `<${randomUUID()}@huhu.local>`;
      const draftId = randomUUID();
      const mixed = await seedSent("Mixed outcome", [accepted, declined], [unknown], [blind], { messageId: mixedId, states: ["accepted", "not-delivered", "unknown", "accepted"], draftId });
      const blindAccepted = await seedSent("Bcc accepted", [onlyBlind], [], [blind], { messageId: blindId, states: ["not-delivered", "accepted"] });
      const uncertain = await seedSent("Only unknown", [unknown], [], [], { messageId: uncertainId, states: ["unknown"] });
      const results = [{ address: accepted, state: "accepted" }, { address: declined, state: "not-delivered" }, { address: unknown, state: "unknown" }];
      const mixedTarget = { source: "sent", accountId: a, operationId: mixed };
      expect(await call("mail.conversations.findMessage", { target: mixedTarget })).toMatchObject({ message: { source: "sent", delivery: { recipients: results } } });
      const retry = await seedSent("Retry declined", [declined], [], [], { retry: { operationId: mixed, messageId: mixedId }, draftId });

      sentWindow.messages.push(
        fixtureMail("Mixed cached", 43, 7, [`From: ${aEmail}`, `To: ${accepted}, ${declined}`, `Cc: ${unknown}`, `Bcc: ${blind}`], mixedId),
        fixtureMail("Bcc cached", 44, 8, [`From: ${aEmail}`, `To: ${onlyBlind}`, `Bcc: ${blind}`], blindId),
        fixtureMail("Unknown cached", 45, 9, [`From: ${aEmail}`, `To: ${unknown}`], uncertainId),
      );
      await refresh(a, "Sent");
      const { conversations } = await call<ConversationsPage>("mail.conversations.list", { accountId: a });
      const partialGroup = conversations.find(({ participants }) => participants.includes(accepted));
      expect(partialGroup).toMatchObject({ participants: [accepted], count: 1, latest: { source: "imap", subject: "Mixed cached", delivery: { operationId: mixed, recipients: results } } });
      const retryGroup = conversations.find(({ participants }) => participants.includes(declined));
      expect(retryGroup).toMatchObject({ participants: [declined], count: 1, latest: { source: "sent", operationId: retry } });
      const participants = conversations.flatMap((conversation) => conversation.participants);
      expect(participants).not.toContain(onlyBlind);
      expect(participants).not.toContain(unknown);
      expect(await call("mail.conversations.messages", { accountId: a, conversationId: partialGroup!.conversationId })).toMatchObject({ messages: [partialGroup!.latest] });
      expect(await call("mail.conversations.findMessage", { target: mixedTarget })).toMatchObject({ conversationId: partialGroup!.conversationId, message: partialGroup!.latest });
      expect(await call("mail.conversations.search", { accountId: a, text: declined })).toMatchObject({ hits: [{ target: { operationId: retry }, participants: [declined] }] });
      for (const operationId of [blindAccepted, uncertain]) {
        await expect(call("mail.conversations.sentBody", { accountId: a, operationId })).rejects.toThrow("NOT_FOUND");
      }
      expect(await call("mail.outbox.status", { operationId: mixed })).toMatchObject({ state: "unknown", retryableRecipients: [] });
      expect(await call("mail.outbox.status", { operationId: uncertain })).toMatchObject({ state: "unknown", recipients: [{ address: unknown, state: "unknown" }] });

      // Remove a valid derived index and place a malformed unrelated receipt next to it.
      // The list rebuilds just the missing metadata from its source and keeps the same groups.
      const mailboxSource = `.huhu/cache/mail/${createHash("sha256").update(JSON.stringify([a, "INBOX"])).digest("hex")}.json`;
      const artifact = `.huhu/cache/mail-projections/${createHash("sha256").update(mailboxSource).digest("hex")}.received.json`;
      const malformed = `.huhu/mail/outbox/${"f".repeat(64)}.json`;
      rmSync(engine.vault.files.abs(artifact));
      await engine.vault.files.write(malformed, Buffer.from("{broken fixture"));
      try {
        const reads = vi.spyOn(engine.vault.files, "read");
        try {
          expect((await call<ConversationsPage>("mail.conversations.list", { accountId: a })).conversations).toEqual(conversations);
          expect(reads.mock.calls.filter(([relative]) => relative === mailboxSource)).toHaveLength(1);
          reads.mockClear();
          expect((await call<ConversationsPage>("mail.conversations.list", { accountId: a })).conversations).toEqual(conversations);
          expect(reads.mock.calls.some(([relative]) => relative === mailboxSource)).toBe(false);
        } finally {
          reads.mockRestore();
        }
      } finally {
        rmSync(engine.vault.files.abs(malformed));
      }
      const mailbox = engine.vault.files.read(mailboxSource);
      assert(mailbox);
      const badSnapshot = await engine.vault.files.write(mailboxSource, Buffer.from("{corrupt mailbox"), { expectedVersion: mailbox.version });
      try {
        const isolated = await call<ConversationsPage>("mail.conversations.list");
        expect(isolated.conversations.some(({ latest }) => latest.subject === "New generation")).toBe(false);
        expect((await call<MailSearchPage>("mail.conversations.search", asia)).total).toBe(1);
      } finally {
        await engine.vault.files.write(mailboxSource, mailbox.bytes, { expectedVersion: badSnapshot.version });
      }

    } finally {
      try {
        if (engine?.moduleCredentialHost) {
          const owner = new ModuleCredentials({ ...engine.moduleCredentialHost, vault: engine.vault, pluginId: "mail", definition: mailAccountDefinitionSchema, targets: ({ settings }) => accountTargets(settings) });
          for (const row of await owner.list()) await owner.delete(row.entityId, row.revision);
        }
      } finally {
        await Promise.all([engine?.shutdown(), imapA.close(), imapB.close(), smtp.close()]);
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      }
    }
  },
  90_000,
);
