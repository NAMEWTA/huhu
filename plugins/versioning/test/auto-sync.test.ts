import { HuhuError, type PeriodicRunContext } from "@huhu/contracts";
import { expect, test, vi } from "vitest";
import { AutoSync, type AutoSyncConfig, type RunMode } from "../src/engine/auto-sync.js";
import { SyncAuthFailure, type VersioningAuth } from "../src/engine/remote-auth.js";

function setup() {
  const config: AutoSyncConfig = { mode: "full", pullIntervalSec: 30, pushIntervalSec: 60 };
  const state = { target: "https://fixture.invalid/a.git", conflict: false, now: 0 };
  const run = vi.fn(async (_mode: RunMode, current: () => boolean, _signal: AbortSignal, _repair?: VersioningAuth) => current());
  const wake = vi.fn();
  const auto = new AutoSync({
    config: () => config, authTarget: () => state.target, hasConflict: () => state.conflict,
    run, wake, now: () => state.now,
  });
  const controller = new AbortController();
  const context: PeriodicRunContext = {
    planId: "periodic-versioning-sync", revision: "plan-r1", occurrenceId: "plan-occurrence",
    scheduledFor: new Date(0).toISOString(), signal: controller.signal, isCurrent: () => !controller.signal.aborted, wake: vi.fn(),
  };
  const auth = (revision: string | null): VersioningAuth => ({ source: "versioning", target: state.target, revision });
  return { auto, config, state, run, wake, context, controller, auth };
}

test("the two plan actions retain pull and full sync and share cancellation from Automations", async () => {
  const t = setup();
  await t.auto.run("pull", t.context);
  await t.auto.run("sync", t.context);
  expect(t.run.mock.calls.map(([mode]) => mode)).toEqual(["pull", "sync"]);
  expect(t.run.mock.calls[0]?.[2]).toBe(t.context.signal);
  t.controller.abort();
  expect(t.run.mock.calls[0]?.[1]()).toBe(false);
});

test("conflict and transient backoff publish eligibility for the same plans", async () => {
  const t = setup();
  t.state.conflict = true;
  expect(t.auto.availability("sync")).toMatchObject({ state: "blocked", reason: "domain-conflict" });
  t.state.conflict = false;
  t.run.mockRejectedValueOnce(new HuhuError("INTERNAL", "fixture"));
  await expect(t.auto.run("pull", t.context)).rejects.toThrow("fixture");
  expect(t.auto.state().failures).toBe(1);
  expect(t.auto.availability("pull").state).toBe("blocked");
  t.state.now = 60_000;
  expect(t.auto.availability("pull").state).toBe("ready");
  await t.auto.run("pull", t.context);
  expect(t.auto.state().failures).toBe(0);
});

test("credential replacement requests one wake for the current full plan and validates the exact repair", async () => {
  const t = setup();
  t.auto.credentialsChanged(null, t.auth("failed"), false);
  t.auto.noteManualFailure(new SyncAuthFailure(new HuhuError("GIT_AUTH_FAILED", "fixture"), t.auth("failed")));
  expect(t.auto.availability("sync")).toMatchObject({ state: "blocked", reason: "credentials-unavailable" });
  t.auto.credentialsChanged("another", t.auth("wrong"), true);
  expect(t.wake).not.toHaveBeenCalled();
  t.auto.credentialsChanged("failed", t.auth("fresh"), true);
  expect(t.wake).toHaveBeenCalledExactlyOnceWith("sync");
  expect(t.auto.availability("pull").state).toBe("blocked");
  expect(t.auto.availability("sync").state).toBe("ready");
  await t.auto.run("sync", t.context);
  expect(t.run.mock.calls[0]?.[3]).toEqual(t.auth("fresh"));
  expect(t.auto.state().pausedReason).toBeNull();
});

test("disabled source mode or changed target cannot revive a credential wake", () => {
  const t = setup();
  t.auto.credentialsChanged(null, t.auth("failed"), false);
  t.auto.noteManualFailure(new SyncAuthFailure(new HuhuError("GIT_AUTH_FAILED", "fixture"), t.auth("failed")));
  t.config.mode = "off";
  t.auto.credentialsChanged("failed", t.auth("fresh"), true);
  expect(t.wake).not.toHaveBeenCalled();
  t.state.target = "https://fixture.invalid/new.git";
  t.auto.configChanged();
  expect(t.auto.authPause()).toMatchObject({ target: "https://fixture.invalid/a.git", revision: "failed" });
  expect(t.auto.availability("pull")).toEqual({ state: "ready" });
});
