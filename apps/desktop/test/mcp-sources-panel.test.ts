// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { McpSourceDeletePreview, McpSourcesView } from "../../../packages/contracts/src/mcp-routing.js";
import { EngineClient, EventStream } from "../../../packages/workbench/src/engine-client/client.js";
import { EngineProvider } from "../../../packages/workbench/src/engine-client/react.js";
import { McpSourcesPanel } from "../../../packages/workbench/src/gateway/McpSourcesPanel.js";

const endpoint = { baseUrl: "http://127.0.0.1:1", token: "fixture", vaultId: "vault-a" };
const source = {
  sourceId: "target",
  revision: 9,
  displayName: "目标来源",
  namespace: "target",
  enabled: true,
  configuration: { transport: "streamable-http", url: "https://example.test/mcp", headers: {}, authentication: { kind: "credential", reference: "private-reference", header: "Authorization" } },
} as const;
const list: McpSourcesView = {
  revision: 9,
  readOnly: false,
  credentialHostAvailable: true,
  sources: [{ source, state: "ready", checkedAt: null, diagnostic: null, approved: true, credential: { state: "configured", account: "local-account" } }],
};

let root: Root | undefined;
let removeDialogShim: (() => void) | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  removeDialogShim?.();
  removeDialogShim = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(call: (name: string, input: unknown) => Promise<unknown>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has dialog markup but lacks the native modal methods. Browser focus is exercised by the E2E spec.
  const prototype = HTMLDialogElement.prototype;
  if (typeof prototype.showModal !== "function") {
    Object.defineProperties(prototype, {
      showModal: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = true;
        },
      },
      close: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = false;
        },
      },
    });
    removeDialogShim = () => {
      Reflect.deleteProperty(prototype, "showModal");
      Reflect.deleteProperty(prototype, "close");
    };
  }
  vi.spyOn(EngineClient.prototype, "call").mockImplementation(call as EngineClient["call"]);
  vi.spyOn(EventStream.prototype, "start").mockImplementation(() => {});
  const element = document.body.appendChild(document.createElement("div"));
  const mounted = createRoot(element);
  root = mounted;
  await act(async () =>
    mounted.render(
      createElement(EngineProvider, {
        endpoint,
        children: createElement(McpSourcesPanel, { kind: "tool", filter: "", published: true }),
      }),
    ),
  );
  return element;
}

async function waitFor(condition: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    condition();
  });
}

async function clickButton(container: ParentNode, label: string) {
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent === label);
  expect(button).toBeDefined();
  expect(button?.disabled).toBe(false);
  await act(async () => {
    button?.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

test("renders visible loading and empty states for sources", async () => {
  const response = Promise.withResolvers<McpSourcesView>();
  const panel = await mount(async (name) => (name === "mcp.sources.list" ? response.promise : { entries: [] }));
  expect(panel.querySelector('[role="status"]')?.textContent).toBe("正在读取外部来源…");
  response.resolve({ ...list, sources: [] });
  await waitFor(() => expect(panel.textContent).toContain("还没有外部来源。添加服务或导入已有配置。"));
  expect(panel.querySelector('[role="status"]')).toBeNull();
});

test("renders source list read failure as an alert", async () => {
  const panel = await mount(async (name) => {
    if (name === "mcp.sources.list") throw new Error("来源暂时无法读取");
    return { entries: [] };
  });
  await waitFor(() => expect(panel.querySelector('[role="alert"]')?.textContent).toBe("来源暂时无法读取"));
});

test("shows scoped, redacted deletion effects and submits the previewed revisions", async () => {
  const response = Promise.withResolvers<McpSourceDeletePreview>();
  let deleted = false;
  const call = vi.fn(async (name: string, _input: unknown) => {
    if (name === "mcp.sources.list") return deleted ? { ...list, sources: [] } : list;
    if (name === "mcp.sources.deletePreview") return response.promise;
    if (name === "mcp.sources.delete") {
      deleted = true;
      return { sourceId: source.sourceId };
    }
    return { entries: [] };
  });
  const panel = await mount(call);
  await waitFor(() => expect(panel.textContent).toContain("目标来源"));
  await clickButton(panel, "目标来源");
  await clickButton(panel, "删除");
  const dialog = panel.querySelector("dialog")!;
  expect(dialog.querySelector('[role="status"]')?.textContent).toBe("正在读取删除影响…");
  expect([...dialog.querySelectorAll("button")].find((button) => button.textContent === "确认删除")?.disabled).toBe(true);
  response.resolve({ policyRevision: 7, entries: [{ kind: "tool", publicKey: "target__echo" }], hasExecutionApproval: false, clearsLocalCredential: true });
  await waitFor(() => expect(dialog.textContent).toContain("将撤下 1 项开放路由"));
  expect(dialog.querySelector("ul")?.textContent).toContain("target__echo");
  expect(dialog.textContent).toContain("本机执行许可：无绑定");
  expect(dialog.textContent).toContain("本机凭据：有绑定，将移除");
  expect(dialog.textContent).not.toMatch(/private-reference|local-account|Authorization/);
  expect(call).toHaveBeenCalledWith("mcp.sources.deletePreview", { sourceId: source.sourceId, expectedRevision: 9 }, expect.any(Object));
  await clickButton(dialog, "确认删除");
  expect(call).toHaveBeenCalledWith("mcp.sources.delete", { sourceId: source.sourceId, expectedRevision: 9, expectedPolicyRevision: 7 }, { write: true });
  await waitFor(() => expect(panel.querySelector("dialog")).toBeNull());
});

test.each(["empty", "error"])("renders %s deletion effects", async (state) => {
  const panel = await mount(async (name) => {
    if (name === "mcp.sources.list") return list;
    if (name === "mcp.sources.deletePreview") {
      if (state === "error") throw new Error("来源已变化");
      return { policyRevision: 0, entries: [], hasExecutionApproval: false, clearsLocalCredential: false };
    }
    return { entries: [] };
  });
  await waitFor(() => expect(panel.textContent).toContain("目标来源"));
  await clickButton(panel, "目标来源");
  await clickButton(panel, "删除");
  const dialog = panel.querySelector("dialog")!;
  if (state === "error") {
    await waitFor(() => expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("来源已变化"));
    expect([...dialog.querySelectorAll("button")].find((button) => button.textContent === "确认删除")?.disabled).toBe(true);
  } else {
    await waitFor(() => expect(dialog.textContent).toContain("没有开放路由"));
    expect(dialog.textContent).toContain("本机凭据：无绑定");
  }
});
