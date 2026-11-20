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

// Each byte difference is tied to the observed source and raw serialized digests.
const serializationDifferences = new Map<string, { source: string; output: string; reason: string; equivalent: boolean }>([
  [
    "gfm/examples.json:2:markdown",
    { source: "d9f084a5a07860cea1f9405d281ebd06c29ba2c45e5f168f7ad401f5d6e523fa", output: "bafa6066d5aaacc73b45b9b11338e0961d510d30ccc694a14e6647a54e91b016", reason: "为表格分隔行和正文行补外侧竖线", equivalent: true },
  ],
  [
    "gfm/examples.json:4:markdown",
    { source: "02f3923ee599aca9a79481943dfc90282b6414218c518ff3a859522d1c0ae538", output: "f92d15c6770e026392df13701fcae82a2460f0b00ba7f8d21adce4f0ee76c23f", reason: "无效表格按普通段落转义行首竖线", equivalent: true },
  ],
  [
    "gfm/examples.json:6:markdown",
    { source: "dcb52ff70876f688c97067997d19dc403afa1c1499f63000b688faa5d242640b", output: "73cd2a1de4b0f82ee81621d15acbe91f60abb68db2900324c2c4ac0c75c10eed", reason: "为最后一行表格正文补外侧竖线", equivalent: true },
  ],
  [
    "gfm/examples.json:8:markdown",
    { source: "1ac5419f79283ee3aec6992efe5d7f9ed9cb081bcbaf95e6591438032d1d84c7", output: "27cd63a113fc7a2491eaf2246ebd0dcca659806da26d097223332a7abe316fa9", reason: "转义跨段且不构成删除线的波浪号", equivalent: true },
  ],
  [
    "gfm/examples.json:18:markdown",
    { source: "70a33af91194f50e870279bcd2d23092772a146cdf0d8766fe1d5889b3009365", output: "fc1d16c8fef0d244ed45cbd175618199c7f4ba15b73313f0d4e93c4809a544d0", reason: "在表格与下方引用之间补空行", equivalent: true },
  ],
  [
    "gfm/examples.json:19:markdown",
    { source: "1ac5419f79283ee3aec6992efe5d7f9ed9cb081bcbaf95e6591438032d1d84c7", output: "27cd63a113fc7a2491eaf2246ebd0dcca659806da26d097223332a7abe316fa9", reason: "转义跨段且不构成删除线的波浪号", equivalent: true },
  ],
  [
    "gfm/examples.json:20:markdown",
    { source: "d2d5a025592216828c210c30df482836fc5540dc34a4231829262cc84d7d25fb", output: "b5d05174d6dfbb28946b6a280ceeff7f2bb6f78772d35a54fe7ee1f9fe7041bb", reason: "在表格与下方引用之间补空行", equivalent: true },
  ],
  [
    "mdx/crash-taxonomy.json:1:input",
    { source: "bb77f45e40d0bd06b8e5fe9dd93e3781e0e142e4a7e21db38c2381e80276a366", output: "72fe45002b2b25149a0d1f9c6ecdaad3f4ce99d15dc61625ac03db44b60439a2", reason: "转义未闭合的花括号", equivalent: true },
  ],
  [
    "perf/100.md",
    { source: "2e740f34d75b4e1bfcd23b18c7b8ec15df6ec2f4a182b78aec00e59469ea9948", output: "440f7774c2e488415f479c672a80083ae9ef6280c1bd9f4da9549ed29e75b88e", reason: "在直接相连的段落和列表之间补空行并规范分隔符", equivalent: true },
  ],
  [
    "perf/1000.md",
    { source: "8456ac78ddc72b605e6f684013ef57723d7629fd2e9de35bba3c2d4df3cce3c3", output: "f139d09b1a32248813f4bfca5ec8ac92625a4752475f42853b0c103b563827f8", reason: "在直接相连的段落和列表之间补空行并规范分隔符", equivalent: true },
  ],
  [
    "perf/10000.md",
    { source: "29b119dd6e9e0d12005d6db4b440c97972351f8326b397bc2dda3f4163f211ed", output: "f4ed96bc2b4affdac19dd0c8b257ad19612d4bad7bd09f3935404e7a2e4944bb", reason: "在直接相连的段落和列表之间补空行并规范分隔符", equivalent: true },
  ],
  [
    "perf/20000.md",
    { source: "e0e0c89990fd73ea150efe3259a60ac207e0a8afde48cb8d23cd78f33a261766", output: "837722366cbb4656cf09f2f6c30992b007fe0b7fffc3531a7649cc8f91fbf643", reason: "在直接相连的段落和列表之间补空行并规范分隔符", equivalent: true },
  ],
  [
    "perf/2500.md",
    { source: "93364823b1736b610f5ea53b67f562a1f997a2bb471032cfb6d79bd7727735d1", output: "f6bca327c50f2141bb676ca806f0a167a8fc9181386de0f01196200109ea59d1", reason: "在直接相连的段落和列表之间补空行并规范分隔符", equivalent: true },
  ],
  [
    "perf/500.md",
    { source: "907cc92eb5628a9e7ca82316e46dfc5a3a8caf7bc855f7b074b318f276418248", output: "e24db948981465bb7c52235b0569eff0be7e5fff3b6e555de119dc099324e904", reason: "在直接相连的段落和列表之间补空行并规范分隔符", equivalent: true },
  ],
  [
    "perf/5000.md",
    { source: "bb63b56fc08a3f66ec6b951ccb7dad70f2b925b3637e8580bed430f2eee15e0c", output: "c4c02edd497413bc18937c22990aeba64bd0b50586fa527cd3c41211d0f8d1c8", reason: "在直接相连的段落和列表之间补空行并规范分隔符", equivalent: true },
  ],
  [
    "perf/large-realistic.md",
    { source: "ef265e8e377d0c4f0649206aad1143753f7c6135a345f056c68265b9eb0f8e78", output: "4d5dd965fde1cbbf03206cf55d843d1ce62aece158e8ee475b2faafc753542f4", reason: "在紧邻正文的二级标题前补空行", equivalent: true },
  ],
  [
    "regression/prd-6955-before.md",
    { source: "2df748352e0cbd8bd7b7ead80306a0aada659efc2d25d0e69d4a1f9e912a1405", output: "7c0d61435db4b5a80c62febc74dabd0eb55f2f2eecb4d76ffd4e9822d7e4b267", reason: "转义正文中不构成语法的波浪号并规范分隔符", equivalent: true },
  ],
  [
    "regression/prd-6955-corrupted-triplicated.md",
    { source: "ded7bb5b69dc0a4907bb2c1e6839b40ae0c8be5402f4047e33f49aaaf04a4169", output: "6b54b8ff2f0a1746b36b23f9e9b98f45fd465042da5a6c17e79fa27e4c3c5373", reason: "转义正文中不构成语法的波浪号并规范分隔符", equivalent: true },
  ],
  [
    "comment-bom-crlf.base64",
    {
      source: "d12eb6e0fb657c3a013f39ea0fbc9972b5439e45f66ae583c635c692ce619741",
      output: "dfefb6f591e20a4ab66b608d8d9b1bf25820b40dcd4151a7674ffd0dc64d54b3",
      reason: "固定 OK 将 BOM 后的 YAML 起始围栏当分隔线，且输出混合换行，生产谓词拒绝等价",
      equivalent: false,
    },
  ],
]);

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
      const difference = serializationDifferences.get(name);
      if (!difference) {
        expect(serialized).toBe(original);
        return;
      }
      const digest = (text: string) => createHash("sha256").update(text).digest("hex");
      expect(digest(original), difference.reason).toBe(difference.source);
      expect(digest(serialized), difference.reason).toBe(difference.output);
      const canonicalize = createDocCanonicalizer(markdown.mdManager, {});
      expect(core.isParseEquivalentBridge(original, serialized, canonicalize), difference.reason).toBe(difference.equivalent);
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
