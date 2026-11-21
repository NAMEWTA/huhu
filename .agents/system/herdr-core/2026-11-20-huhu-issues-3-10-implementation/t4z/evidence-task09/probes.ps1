param([Parameter(Mandatory=$true)][string]$Evidence)
$ErrorActionPreference='Stop'
$cases=Get-Content -Raw -LiteralPath (Join-Path $Evidence 'layout.json') | ConvertFrom-Json
$child=($cases | Where-Object name -eq 'candidate').path
$parent=($cases | Where-Object name -eq 'parent').path
$utf8=New-Object System.Text.UTF8Encoding($false)
function Replace-Anchor($contents,$old,$new){
 if(!$contents.Contains($old)){throw ('Missing test anchor: '+$old)}
 $contents.Replace($old,$new)
}
$base=[IO.File]::ReadAllText((Join-Path $child 'plugins/mail/test/accounts.test.ts')).Replace("`r`n","`n")
$base=Replace-Anchor $base 'import { openImapFixture } from "./fixtures/imap.js";' @'
import { openImapFixture } from "./fixtures/t4z-imap.js";
import { discoverImapFolders } from "../src/engine/imap-discovery.js";
'@
$base=Replace-Anchor $base '  if (namespacedInbox === "selectable") {' @'
  const observed = await discovery.then(() => "ok", (error: MailAccountError) => error.code);
  await fixture.disconnected;
  console.info(JSON.stringify({ case: namespacedInbox, result: observed, list: fixture.listRequests, commands: fixture.commands }));
  if (namespacedInbox === "selectable") {
'@
$base=Replace-Anchor $base '  const reentrantResult = await reentrant;' @'
  const reentrantResult = await reentrant;
  console.info(JSON.stringify({
    case: "synchronous retest in update abort",
    reentrant: reentrantResult instanceof MailAccountError ? reentrantResult.code : "ok",
    invocations: discover.mock.calls.map(([args]) => [args.email, args.endpoint.port])
  }));
'@
$base += @'

test("t4z loopback abort, failed replacement, and current snapshot commit exactly once", async () => {
  const a = await openImapFixture({ stallList: true, login: ["first@example.invalid", "syntheticA"] });
  const b = await openImapFixture({ rejectLogin: true, login: ["second@example.invalid", "syntheticB"] });
  const c = await openImapFixture({ namespacedInbox: "selectable", lsubMode: "no", login: ["third@example.invalid", "syntheticC"] });
  for (const fixture of [a, b, c]) cleanup.push(fixture.close);
  const aCfg = { ...settings(a.port), email: "first@example.invalid", auth: "app-password", provider: "qq" } as const;
  const bCfg = { ...aCfg, email: "second@example.invalid", imap: { ...aCfg.imap, port: b.port } };
  const cCfg = { ...bCfg, email: "third@example.invalid", imap: { ...bCfg.imap, port: c.port } };
  const pass = { a: "synthetic A", b: "synthetic B", c: "synthetic C" };
  let restart: Promise<unknown> | undefined;
  let draft: ReturnType<ReturnType<typeof openMailAccounts>["begin"]>;
  const captured: Array<[string, number, boolean]> = [];
  const discover: MailFolderDiscovery = (args) => {
    if (args.email === aCfg.email) args.signal.addEventListener("abort", () => {
      restart = draft.testConnection().catch((error: unknown) => error);
    }, { once: true });
    const expected = args.email === aCfg.email ? pass.a : args.email === bCfg.email ? pass.b : pass.c;
    captured.push([args.email, args.endpoint.port, args.password === expected.replace(/\s+/g, "")]);
    return discoverImapFolders(args);
  };
  const { accounts, owner, vault, protection, close, open } = await setup(discover);
  draft = accounts.begin(aCfg, pass.a);
  const writes = vi.spyOn(vault.files, "write");
  const pending = draft.testConnection().catch((error: unknown) => error);
  await a.listed;
  draft.update(bCfg, pass.b);
  expect(await restart).toMatchObject({ code: "discovery-stale" });
  expect(await pending).toMatchObject({ code: "discovery-stale" });
  await a.disconnected;
  expect([a.commands, b.commands, c.commands].map((sessions) => sessions.filter((verb) => verb === "LOGIN").length)).toEqual([1, 0, 0]);
  await expect(draft.save()).rejects.toMatchObject({ code: "discovery-required" });
  await expect(draft.testConnection()).rejects.toMatchObject({ code: "authentication" });
  await b.disconnected;
  // A changed IMAP identity requires explicit re-entry of the credential.
  draft.update(cCfg);
  await expect(draft.testConnection()).rejects.toMatchObject({ code: "credential-required" });
  expect(c.commands).toEqual([]);
  expect(writes).toHaveBeenCalledTimes(0);
  expect(protection.keys()).toHaveLength(0);

  draft.update(cCfg, pass.c);
  expect(await draft.testConnection()).toMatchObject([{ path: "INBOX", selected: true }, { path: "INBOX.Projects", delimiter: "." }]);
  await c.disconnected;
  expect(c.commands).toContain("LSUB");
  draft.selectFolders(["INBOX", "INBOX.Projects"]);
  const saved = await draft.save();
  expect(saved.definition.settings).toEqual(cCfg);
  expect(saved.definition.folders.map(({ path }) => path)).toEqual(["INBOX", "INBOX.Projects"]);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(protection.keys()).toHaveLength(1);
  writes.mockRestore();
  await close();
  const reopened = await open();
  expect(await reopened.accounts.list()).toEqual([saved]);
  const credentials = new ModuleCredentials({
    ...owner, vault: reopened.vault, pluginId: "mail", definition: mailAccountDefinitionSchema,
    targets: ({ settings }) => accountTargets(settings),
  });
  expect(await credentials.use(saved.accountId, [accountPasswordPurpose], async (definition, values) => {
    return definition.settings.email === cCfg.email && definition.settings.imap.port === c.port &&
      values.get(accountPasswordPurpose) === pass.c.replace(/\s+/g, "");
  })).toBe(true);
  expect(captured).toEqual([[aCfg.email, a.port, true], [bCfg.email, b.port, true], [cCfg.email, c.port, true]]);
  const logins = [a, b, c].map((fixture) => fixture.commands.filter((verb) => verb === "LOGIN").length);
  expect(logins).toEqual([1, 1, 1]);
  const wireLoginMatched = [a, b, c].map((fixture) => fixture.loginChecks);
  expect(wireLoginMatched).toEqual([[true], [true], [true]]);
  console.info(JSON.stringify({ case: "real loopback A-B-C", logins, wireLoginMatched, lists: [a.listRequests.length, b.listRequests.length, c.listRequests.length],
    invocations: captured.length, writesBeforeSuccessfulSave: 0, totalWrites: 1, keys: protection.keys().length,
    savedScopeMatchesDiscovery: true, readbackPasswordMatches: true, lsubNoRetainedListing: true }));
});

test("t4z subscription-only INBOX stays missing after a successful LIST", async () => {
  const fixture = await openImapFixture({ namespacedInbox: "missing", lsubMode: "phantom" });
  cleanup.push(fixture.close);
  const { accounts, protection, vault } = await setup();
  const write = vi.spyOn(vault.files, "write");
  const draft = accounts.begin(settings(fixture.port), password);
  await expect(draft.testConnection()).rejects.toMatchObject({ code: "inbox-required" });
  await fixture.disconnected;
  await expect(draft.save()).rejects.toMatchObject({ code: "discovery-required" });
  expect(fixture.commands).toContain("LSUB");
  expect(write).toHaveBeenCalledTimes(0);
  expect(protection.keys()).toHaveLength(0);
  expect(await accounts.list()).toEqual([]);
  write.mockRestore();
  console.info(JSON.stringify({ case: "subscription-only INBOX", lists: fixture.listRequests, lsub: 1, writes: 0, result: "inbox-required" }));
});
'@
$fixture=[IO.File]::ReadAllText((Join-Path $child 'plugins/mail/test/fixtures/imap.ts')).Replace("`r`n","`n")
$fixture=Replace-Anchor $fixture 'disconnectDuringList?: boolean; namespacedInbox?' 'disconnectDuringList?: boolean; lsubMode?: "phantom" | "no"; login?: readonly [string, string]; namespacedInbox?'
$fixture=Replace-Anchor $fixture '  const listRequests: string[] = [];' @'
  const listRequests: string[] = [];
  const loginChecks: boolean[] = [];
'@
$fixture=Replace-Anchor $fixture '        case "LOGIN":' @'
        case "LOGIN":
          if (options.login) {
            const fields = line.slice(`${tag} ${verb} `.length).replaceAll('"', "").split(" ");
            loginChecks.push(fields.length === 2 && fields[0] === options.login[0] && fields[1] === options.login[1]);
          }
'@
$fixture=Replace-Anchor $fixture '    listRequests,' @'
    listRequests,
    loginChecks,
'@
$fixture=Replace-Anchor $fixture '        case "LSUB":' @'
        case "LSUB":
          if (options.lsubMode === "no") return socket.write(`${tag} NO subscription details unavailable\r\n`);
          if (options.lsubMode === "phantom") return socket.write(`* LSUB () "." "INBOX"\r\n${tag} OK LSUB\r\n`);
'@
foreach($dir in $child,$parent){
 [IO.File]::WriteAllText((Join-Path $dir 'plugins/mail/test/t4z-review.test.ts'),$base,$utf8)
 [IO.File]::WriteAllText((Join-Path $dir 'plugins/mail/test/fixtures/t4z-imap.ts'),$fixture,$utf8)
}
