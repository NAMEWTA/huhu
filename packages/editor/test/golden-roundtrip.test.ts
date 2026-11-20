import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JSONContent } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import * as Y from "yjs";
import { okAliases } from "../build/aliases.mjs";

const fixtureRoots = [new URL("../src/vendor/open-knowledge/core/src/markdown/fixtures/", import.meta.url), new URL("./fixtures/golden/huhu/", import.meta.url)];
const largeThreshold = 256 * 1024;
const samples: { name: string; bytes: Buffer }[] = [];
const markdownKeys = ["markdown", "input", "source", "blockForm", "inlineForm"] as const;
for (const fixtureDir of fixtureRoots) {
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
}

let server: ViteDevServer;
let host: typeof import("../src/host/doc-source");
interface Provider {
  document: Y.Doc;
  on(event: "synced", callback: () => void): void;
  on(event: "authenticationFailed", callback: (error: { reason: string }) => void): void;
  readonly richReady: boolean;
  ensureRich(): Promise<void>;
  settleNow(): void;
  destroy(): void;
}

let providerModule: { LocalDocProvider: new (config: { name: string; lazyRich: boolean }) => Provider };
interface MarkdownRuntime {
  schema: Schema;
  mdManager: { serialize(content: JSONContent): string };
}

let markdown: MarkdownRuntime;
let core: {
  stripFrontmatter(markdown: string): { frontmatter: string; body: string };
  splitFmBoundarySlot(frontmatter: string, body: string): { slot: string };
  composeWithDerivedBody(frontmatter: string, body: string): { md: string };
  isParseEquivalentBridge(original: string, serialized: string, canonicalize: (body: string) => string): boolean;
};
let createDocCanonicalizer: (manager: MarkdownRuntime["mdManager"], options: object) => (body: string) => string;
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
  markdown = (await server.ssrLoadModule("/src/vendor/open-knowledge/server-bridge/md-manager.ts")) as typeof markdown;
  core = (await server.ssrLoadModule("/src/host/core-barrel.ts")) as typeof core;
  const watchdog = (await server.ssrLoadModule("/src/vendor/open-knowledge/server-bridge/bridge-watchdog.ts")) as { createDocCanonicalizer: typeof createDocCanonicalizer };
  createDocCanonicalizer = watchdog.createDocCanonicalizer;
  bridge = (await server.ssrLoadModule("/src/vendor/open-knowledge/server-bridge/bridge-intake.ts")) as typeof bridge;
}, 120_000);

afterAll(async () => server?.close());

async function withProvider(name: string, text: string, verify: (provider: Provider) => void | Promise<void>): Promise<void> {
  host.setDocSource({ read: async () => text });
  // Electron 以源码模式打开超过 256 Ki 字符的笔记（NoteDocument 的 LARGE_DOC_CHARS）。
  const provider = new providerModule.LocalDocProvider({ name, lazyRich: text.length > largeThreshold });
  try {
    await new Promise<void>((resolve, reject) => {
      provider.on("synced", () => resolve());
      provider.on("authenticationFailed", ({ reason }: { reason: string }) => reject(new Error(reason)));
    });
    provider.settleNow();
    await verify(provider);
  } finally {
    provider.destroy();
    provider.document.destroy();
    host.setDocSource(null);
  }
}

test.each(samples)(
  "H01 源缓冲保留字节并经富文本 hydrate→serialize $name",
  async ({ name, bytes }) => {
    const original = bytes.toString("utf8");
    await withProvider(name, original, async (provider) => {
      expect(Buffer.from(provider.document.getText("source").toString()).equals(bytes)).toBe(true);
      const fragment = provider.document.getXmlFragment("default");
      if (original.length > largeThreshold) {
        expect(provider.richReady).toBe(false);
        expect(fragment.length).toBe(0);
      }
      await provider.ensureRich();
      expect(provider.richReady).toBe(true);
      const rich = yXmlFragmentToProseMirrorRootNode(fragment, markdown.schema);
      const { frontmatter, body } = core.stripFrontmatter(original);
      const { slot } = core.splitFmBoundarySlot(frontmatter, body);
      const serialized = core.composeWithDerivedBody(frontmatter, slot + markdown.mdManager.serialize(rich.toJSON())).md;
      expect(Buffer.from(provider.document.getText("source").toString()).equals(bytes)).toBe(true);
      if (serialized === original) return;
      const canonicalize = createDocCanonicalizer(markdown.mdManager, {});
      const digest = (text: string) => createHash("sha256").update(text).digest("hex");
      const equivalent = core.isParseEquivalentBridge(original, serialized, canonicalize);
      const firstDifference = original
        .slice(0, 4096)
        .split("")
        .findIndex((char, i) => char !== serialized[i]);
      console.log(
        "H01 difference " +
          JSON.stringify([
            name,
            digest(original),
            digest(serialized),
            equivalent,
            original.length,
            serialized.length,
            firstDifference,
            original.slice(Math.max(0, firstDifference - 30), Math.max(0, firstDifference - 30) + 120),
            serialized.slice(Math.max(0, firstDifference - 30), Math.max(0, firstDifference - 30) + 120),
          ]),
      );
    });
  },
  360_000,
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
