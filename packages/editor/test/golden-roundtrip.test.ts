import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import * as Y from "yjs";
import { okAliases } from "../build/aliases.mjs";

const fixtureDir = new URL("./fixtures/golden/", import.meta.url);
const samples: { name: string; bytes: Buffer }[] = [];
const markdownKeys = ["markdown", "input", "source", "blockForm", "inlineForm"] as const;
for (const entry of readdirSync(fileURLToPath(fixtureDir), { recursive: true, encoding: "utf8" }).sort()) {
  const file = new URL(entry, fixtureDir);
  if (entry.endsWith(".md")) samples.push({ name: entry, bytes: readFileSync(file) });
  if (entry.endsWith(".base64")) samples.push({ name: entry, bytes: Buffer.from(readFileSync(file, "utf8"), "base64") });
  if (!entry.endsWith(".json")) continue;
  const cases = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
  for (const [index, value] of cases.entries()) {
    for (const key of markdownKeys) {
      const markdown = value[key];
      if (typeof markdown === "string") samples.push({ name: `${entry}:${index + 1}:${key}`, bytes: Buffer.from(markdown) });
    }
  }
}

let server: ViteDevServer;
let host: typeof import("../src/host/doc-source");
interface Provider {
  document: Y.Doc;
  on(event: "synced", callback: () => void): void;
  on(event: "authenticationFailed", callback: (error: { reason: string }) => void): void;
  settleNow(): void;
  destroy(): void;
}

let providerModule: { LocalDocProvider: new (config: { name: string; lazyRich: boolean }) => Provider };
let bridge: { replaceRawBody(document: Y.Doc, text: string): void };

beforeAll(async () => {
  const editorRoot = fileURLToPath(new URL("../", import.meta.url));
  server = await createServer({
    root: editorRoot,
    configFile: false,
    resolve: { alias: okAliases(editorRoot) },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  host = (await server.ssrLoadModule("/src/host/doc-source.ts")) as typeof host;
  providerModule = (await server.ssrLoadModule("/src/host/hocuspocus-provider.ts")) as typeof providerModule;
  bridge = (await server.ssrLoadModule("/src/vendor/open-knowledge/server-bridge/bridge-intake.ts")) as typeof bridge;
}, 30_000);

afterAll(async () => server?.close());

async function withProvider(name: string, text: string, verify: (provider: Provider) => void): Promise<void> {
  host.setDocSource({ read: async () => text });
  // Electron 以源码模式打开超过 256 Ki 字符的笔记（NoteDocument 的 LARGE_DOC_CHARS）。
  const provider = new providerModule.LocalDocProvider({ name, lazyRich: text.length > 256 * 1024 });
  try {
    await new Promise<void>((resolve, reject) => {
      provider.on("synced", () => resolve());
      provider.on("authenticationFailed", ({ reason }: { reason: string }) => reject(new Error(reason)));
    });
    provider.settleNow();
    verify(provider);
  } finally {
    provider.destroy();
    provider.document.destroy();
    host.setDocSource(null);
  }
}

test.each(samples)(
  "H01 保留源缓冲字节 $name",
  async ({ name, bytes }) => {
    await withProvider(name, bytes.toString("utf8"), (provider) => {
      expect(Buffer.from(provider.document.getText("source").toString()).equals(bytes)).toBe(true);
    });
  },
  90_000,
);

test("B05 以外部文件来源替换正文不产生撤销记录", async () => {
  await withProvider("undo.md", "原文\n", ({ document }) => {
    const source = document.getText("source");
    const fragment = document.getXmlFragment("default");
    const userEdit = Symbol("user edit");
    const undo = new Y.UndoManager([source, fragment], { trackedOrigins: new Set([userEdit]) });
    try {
      document.transact(() => bridge.replaceRawBody(document, "外部版本\n"), host.FILE_LOAD_ORIGIN);
      expect(source.toString()).toBe("外部版本\n");
      expect(fragment.toString()).toContain("外部版本");
      expect(undo.undoStack).toHaveLength(0);
      document.transact(() => source.insert(0, "我的"), userEdit);
      expect(undo.undoStack).toHaveLength(1);
      undo.undo();
      expect(source.toString()).toBe("外部版本\n");
    } finally {
      undo.destroy();
    }
  });
});
