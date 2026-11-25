// @vitest-environment jsdom
import { mergeSettings, SettingsSchema, type Settings } from "@huhu/contracts";
import { checkExitParticipants, createUiStore, EngineProvider, localExitRequest, queryKey, registerModuleLeaveGuard, useQueryClient } from "@huhu/workbench";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { URL as FileURL } from "node:url";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MailAccount } from "../src/engine/accounts.js";
import { MailModule } from "../src/ui/MailModule.js";

// Use the repository's desktop renderer without adding a second renderer dependency to Mail.
const { createRoot } = createRequire(new FileURL("../../../apps/desktop/package.json", import.meta.url))("react-dom/client") as {
  createRoot(container: Element): { render(node: ReactNode): void; unmount(): void };
};
const endpoint = { baseUrl: "http://mail-pane.test", vaultId: "mail-pane-test" };
const settingsKey = queryKey(endpoint.vaultId, "settings.get");
const defaults = SettingsSchema.parse({});
const ok = (data: unknown) => Response.json({ ok: true, data });
const failedWrite = () => Response.json({ ok: false, error: { code: "INTERNAL", message: "settings write failed" } });
const address = { host: "mail.example.test", port: 993, security: "tls" } as const;
const account: MailAccount = {
  accountId: "pane-account",
  revision: "pane-revision",
  authState: { "account-password": "configured" },
  definition: {
    format: 1,
    settings: { provider: "custom_imap", email: "pane@example.test", label: "Mail pane fixture", auth: "password", imap: address, smtpEnabled: false, smtp: address },
    folders: [{ path: "INBOX", name: "INBOX", delimiter: "/", specialUse: null, flags: [] }],
  },
};

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "WebSocket",
    class {
      close() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function waitFor(assert: () => void) {
  await vi.waitFor(async () => {
    await act(() => delay(0));
    assert();
  });
}

async function mount(options: { access?: Promise<Response>; read?: Promise<Response>; firstWrite?: Promise<Response> } = {}) {
  const ui = createUiStore({ activeModule: "mail", openTabs: ["mail"] });
  const writes: Partial<Settings["mail"]>[] = [];
  let stored = defaults;
  let cache: ReturnType<typeof useQueryClient> | undefined;

  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const { capability, input } = JSON.parse(String(init.body)) as { capability: string; input: { patch: { mail: Partial<Settings["mail"]> } } };
    switch (capability) {
      case "vault.info":
        return options.access ?? ok({ readOnly: false });
      case "settings.get":
        return options.read ?? ok(stored);
      case "settings.update":
        writes.push(input.patch.mail);
        if (writes.length === 1 && options.firstWrite) return options.firstWrite;
        stored = mergeSettings(stored, input.patch);
        return ok(stored);
      case "mail.accounts.list":
        return ok({ available: true, accounts: [account] });
      default:
        return ok(null);
    }
  });

  function Workspace({ active }: { active: boolean }) {
    cache = useQueryClient();
    return active ? <MailModule registerLeaveGuard={(guard) => registerModuleLeaveGuard(ui, "mail", guard)} /> : null;
  }

  const render = (active: boolean) =>
    act(() =>
      root.render(
        <EngineProvider endpoint={endpoint}>
          <Workspace active={active} />
        </EngineProvider>,
      ),
    );
  await render(true);
  const separator = () => container.querySelector<HTMLElement>('[role="separator"][aria-label="调整账号栏宽度"]');
  await waitFor(() => expect(separator()).not.toBeNull());
  if (!options.access) {
    const compose = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "写信");
    await waitFor(() => expect(compose?.disabled).toBe(false));
  }
  const resize = (key: string) =>
    act(() => {
      separator()!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  const width = () => separator()?.getAttribute("aria-valuenow");
  return { ui, writes, width, resize, render, cache: () => cache! };
}

it("persists the first resize once the Vault is confirmed writable", async () => {
  const access = Promise.withResolvers<Response>();
  const mail = await mount({ access: access.promise });
  await mail.resize("End");
  expect(mail.writes).toEqual([]);
  expect(mail.width()).toBe("440");
  await act(() => access.resolve(ok({ readOnly: false })));
  await waitFor(() => expect(mail.writes).toEqual([{ accountWidth: 440 }]));
});

it("keeps module navigation and Vault close pending until queued widths settle", async () => {
  const firstWrite = Promise.withResolvers<Response>();
  const mail = await mount({ firstWrite: firstWrite.promise });
  await mail.resize("End");
  await mail.resize("ArrowLeft");
  expect(mail.writes).toEqual([{ accountWidth: 440 }]);

  let destination: boolean | undefined;
  let allowedToClose: boolean | undefined;
  const navigation = Promise.resolve(mail.ui.getState().openModule("home")).then((allowed) => {
    destination = allowed;
  });
  const close = checkExitParticipants(localExitRequest("vault")).then((allowed) => {
    allowedToClose = allowed;
  });
  await act(async () => {});
  expect(destination).toBeUndefined();
  expect(allowedToClose).toBeUndefined();
  expect(mail.ui.getState().activeModule).toBe("mail");

  await act(async () => {
    firstWrite.resolve(ok(mergeSettings(defaults, { mail: { accountWidth: 440 } })));
    await Promise.all([navigation, close]);
  });
  expect(mail.writes).toEqual([{ accountWidth: 440 }, { accountWidth: 428 }]);
  expect(destination).toBe(true);
  expect(allowedToClose).toBe(true);
});

it("denies leave on a failed save and retries the same displayed value", async () => {
  const firstWrite = Promise.withResolvers<Response>();
  const mail = await mount({ firstWrite: firstWrite.promise });
  await mail.resize("End");
  const close = checkExitParticipants(localExitRequest("vault"));
  await act(() => firstWrite.resolve(failedWrite()));
  expect(await close).toBe(false);
  expect(await mail.ui.getState().openModule("home")).toBe(false);
  expect(mail.width()).toBe("440");
  const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "重试保存分栏");
  expect(retry).toBeDefined();
  await act(() => retry!.click());
  expect(mail.writes).toEqual([{ accountWidth: 440 }, { accountWidth: 440 }]);
  expect(await mail.ui.getState().openModule("home")).toBe(true);
});

it("keeps a successful width when the pre-write settings read resolves late", async () => {
  const read = Promise.withResolvers<Response>();
  const mail = await mount({ read: read.promise });
  await mail.resize("End");
  await waitFor(() => expect(mail.cache().getQueryData(settingsKey)).toMatchObject({ mail: { accountWidth: 440 } }));
  await act(() => read.resolve(ok(defaults)));
  await mail.render(false);
  await mail.render(true);
  await waitFor(() => expect(mail.width()).toBe("440"));
});
