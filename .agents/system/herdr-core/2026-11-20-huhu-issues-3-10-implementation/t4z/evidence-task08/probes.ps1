param([Parameter(Mandatory=$true)][string]$Evidence)
$ErrorActionPreference='Stop'
$ev=(Resolve-Path -LiteralPath $Evidence).Path
$layout=Get-Content -LiteralPath "$ev/layout.json" -Raw | ConvertFrom-Json
if ($layout.PSObject.Properties["value"]) { $layout = $layout.value }
$utf8=New-Object System.Text.UTF8Encoding($false)
function Source($case,$relative) {
  return [IO.File]::ReadAllText((Join-Path ($layout | Where-Object name -eq $case).path $relative)).Replace("`r`n","`n")
}
function Target($case,$relative,$contents) {
  $dest=Join-Path ($layout | Where-Object name -eq $case).path $relative
  [IO.File]::WriteAllText($dest,$contents,$utf8)
}
function Change($old,$from,$to) {
  if (!$old.Contains($from)) {throw ('Missing frozen fixture anchor: '+$from)}
  return $old.Replace($from,$to)
}
$launch='plugins/agent-cli/test/launch.live.test.ts'
$reconcile='plugins/agent-cli/test/launch-reconcile.test.ts'
$dispatch='plugins/agent-cli/test/dispatch.live.test.ts'
Target 'parent' 'plugins/agent-cli/test/t4z-parent.live.test.ts' (Source 'w12' $launch)
$w12=(Source 'w12' $reconcile)+@'

test("t4z cross-service duplicate launch and independently damaged request index", async () => {
  const { dir, target, reopen, fake, terminals } = fixture();
  const results = await Promise.allSettled([reopen().launch(target), reopen().launch(target)]);
  const succeeded = results.find((item) => item.status === "fulfilled");
  expect(succeeded?.status).toBe("fulfilled");
  console.info(JSON.stringify({ case: "separate W1.2 service instances", runs: fake.tries, terminalCount: terminals.length, results: results.map((result) => result.status === "fulfilled" ? result.value.launchReceipt?.attempt?.id : result.reason.code) }));
  expect(fake.tries).toBe(1);
  expect(terminals).toHaveLength(1);
});

test("t4z truncated index fences only the affected request", async () => {
  const { dir, target, reopen, fake } = fixture();
  const original = await reopen().launch(target);
  const indexDir = path.join(path.dirname(dir), "launch-requests");
  const names = readdirSync(indexDir);
  expect(names).toHaveLength(1);
  const index = path.join(indexDir, names[0]!);
  const bytes = readFileSync(index);
  writeFileSync(index, '{"requestId":');
  await expect(reopen().launch(target)).rejects.toMatchObject({ code: "RUN_UNKNOWN", details: { reason: "launch_receipt_unavailable" } });
  const other = await reopen().launch({ ...target, requestId: "different-request" });
  writeFileSync(index, bytes);
  const restored = await reopen().launch(target);
  expect(restored.id).toBe(original.id);
  expect(other.id).not.toBe(original.id);
  expect(fake.tries).toBe(2);
  console.info(JSON.stringify({
    case: "W1.2 truncated index",
    indexDamage: "RUN_UNKNOWN", originalRetained: restored.id === original.id, otherRequestSucceeded: true, totalRunCalls: fake.tries
  }));
});
'@
Target 'w12' 'plugins/agent-cli/test/t4z-index.test.ts' $w12
$w61=Source 'w61' $dispatch
$w61=Change $w61 '    let allowReady = true;' @'
    let allowReady = true;
    let agentEnabled = true;
    let blockedReady: (() => Promise<void>) | undefined;
'@
$w61=Change $w61 '        if (!allowReady) return false;' @'
        if (blockedReady) {
          const wait = blockedReady;
          blockedReady = undefined;
          await wait();
        }
        if (!allowReady) return false;
'@
$w61=Change $w61 '        isPluginEnabled: () => true,' '        isPluginEnabled: (id) => id !== "agent-cli" || agentEnabled,'
$w61=Change $w61 '      const records = path.join(vault.stateDir, "agent-cli", "dispatches");' @'
      // Suspend a real in-flight Dispatcher request while the bound provider bootstraps.
      const gated = work("disabled-during-ready", target);
      let unblock!: () => void;
      let startedReady!: () => void;
      const entered = new Promise<void>((resolve) => { startedReady = resolve; });
      const barrier = new Promise<void>((resolve) => { unblock = resolve; });
      blockedReady = () => { startedReady(); return barrier; };
      const pending = request("agent.runs.dispatch", gated);
      await Promise.race([entered, pending.then((reply) => { throw new Error("readiness gate missed: " + JSON.stringify(reply)); })]);
      let denied;
      try {
        agentEnabled = false;
        await dispose?.();
        dispose = undefined;
        denied = await request("agent.runs.dispatch", gated);
      } finally {
        unblock();
      }
      expect(denied).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
      const afterDisable = await pending;
      const count = readdirSync(proofDir)
        .filter((file) => file.endsWith(".jsonl"))
        .flatMap((file) => readers(file.slice(0, -6)))
        .filter((read) => read.dispatchId === gated.dispatchId).length;
      console.info(JSON.stringify({
        case: "disable while provider readiness is pending", dispatchAfterDisable: denied.ok ? "ok" : denied.error.code,
        pendingReply: afterDisable, providerInputCount: count
      }));
      expect(count).toBe(0);
      const records = path.join(vault.stateDir, "agent-cli", "dispatches");
'@
Target 'w61' 'plugins/agent-cli/test/t4z-disable.live.test.ts' $w61

$reopenLive=Source 'w12' $launch
$reopenLive=Change $reopenLive '          apply(ctx, facade("agent-cli", ctx), { herdrBin: bin! });' '          apply(ctx, facade("agent-cli", ctx), { herdrBin: bin!, history: { home: sandbox, env: {} } });'
$reopenLive=Change $reopenLive '      console.info(JSON.stringify({ isolatedId, launchId, sessionId, attemptId, address: original.address, pid: original.pid, createdMs: original.created_ms }));' @'
      console.info(JSON.stringify({ isolatedId, launchId, sessionId, attemptId, address: original.address, pid: original.pid, createdMs: original.created_ms }));
      const duringReload = { ...launch, requestId: crypto.randomUUID() };
      let resume!: () => void;
      let checking!: () => void;
      const ready = new Promise<void>((resolve) => { checking = resolve; });
      const barrier = new Promise<void>((resolve) => { resume = resolve; });
      const ensure = HerdrCore.prototype.ensure;
      let intercepted = false;
      const pauseFirst = vi.spyOn(HerdrCore.prototype, "ensure").mockImplementation(async function (this: HerdrCore) {
        if (this.endpoint === expectedCore.endpoint && !intercepted) {
          intercepted = true;
          checking();
          await barrier;
        }
        return ensure.call(this);
      });
      const oldOperation = request("agent.sessions.launch", duringReload);
      const firstOutcome = await Promise.race([ready.then(() => "paused"), oldOperation.then(() => "completed")]);
      let replacement;
      try {
        expect(firstOutcome).toBe("paused");
        await closeEngine();
        await openEngine();
        replacement = await request("agent.sessions.launch", duringReload);
      } finally {
        resume();
        pauseFirst.mockRestore();
      }
      const old = await oldOperation;
      const truth = new HerdrClient({ endpoint: expectedCore.endpoint });
      await truth.connect();
      const matches = await (async () => {
        try {
          const all = await truth.call<{ terminals: Terminal[] }>("terminal.list", { all: true });
          return all.terminals.filter((terminal) => terminal.labels?.["huhu.launch"] === duringReload.requestId);
        } finally {
          truth.close();
        }
      })();
      const retry = await request("agent.sessions.launch", duringReload);
      const liveSessionId = matches[0]?.labels["huhu.session"];
      const recorded = liveSessionId ? JSON.parse(readFileSync(path.join(vault.stateDir, "agent-cli", "sessions", liveSessionId + ".json"), "utf8")) : null;
      console.info(JSON.stringify({
        case: "same Vault, plugin dispose and reapply before launch send",
        original: old.ok ? "ok" : old.error,
        replacement: replacement?.ok ? "ok" : replacement?.error,
        retry: retry.ok ? "ok" : retry.error,
        recorded: recorded ? { state: recorded.state, attempt: recorded.launchReceipt?.attempt?.id, terminalId: recorded.terminalId } : null,
        matches: matches.map(({ address, pid, labels }) => ({ address, pid, session: labels["huhu.session"], attempt: labels["huhu.launch.generation"] }))
      }));
      expect(matches).toHaveLength(1);
      expect(retry).toMatchObject({ ok: true, data: { id: liveSessionId, terminalId: matches[0]!.address } });
'@
Target 'w12' 'plugins/agent-cli/test/t4z-reload.live.test.ts' $reopenLive
