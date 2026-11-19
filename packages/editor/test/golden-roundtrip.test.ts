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
const largeSamples = samples.filter(({ bytes }) => bytes.toString("utf8").length > largeThreshold);

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
let markdown: { schema: Schema; mdManager: { serialize(content: JSONContent): string } };
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
  "H01 保留源缓冲字节 $name",
  async ({ name, bytes }) => {
    await withProvider(name, bytes.toString("utf8"), (provider) => {
      expect(Buffer.from(provider.document.getText("source").toString()).equals(bytes)).toBe(true);
      if (bytes.toString("utf8").length > largeThreshold) {
        expect(provider.richReady).toBe(false);
        expect(provider.document.getXmlFragment("default").length).toBe(0);
      }
    });
  },
  90_000,
);

test.each(largeSamples)(
  "H01 大样本构建富文本、序列化并回读 $name",
  async ({ name, bytes }) => {
    const original = bytes.toString("utf8");
    const inspectRich = async (provider: Provider) => {
      await provider.ensureRich();
      expect(provider.richReady).toBe(true);
      const fragment = provider.document.getXmlFragment("default");
      expect(fragment.length).toBeGreaterThan(0);
      const rich = yXmlFragmentToProseMirrorRootNode(fragment, markdown.schema);
      return { serialized: markdown.mdManager.serialize(rich.toJSON()), text: rich.textContent, blocks: rich.childCount };
    };
    let initial!: Awaited<ReturnType<typeof inspectRich>>;
    await withProvider(name, original, async (provider) => {
      initial = await inspectRich(provider);
      expect(provider.document.getText("source").toString() === original).toBe(true);
      expect(initial.serialized.length).toBeGreaterThan(0);
    });
    // 序列化器可规范化 Markdown 拼写。回读应保留富文本正文和块结构，并且序列化已经稳定。
    await withProvider(name, initial.serialized, async (provider) => {
      const result = await inspectRich(provider);
      expect(result.blocks).toBe(initial.blocks);
      expect(result.text === initial.text).toBe(true);
      expect(result.serialized === initial.serialized).toBe(true);
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
