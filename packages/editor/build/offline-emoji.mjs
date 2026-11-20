import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const base = "/api/local-emoji";

export const offlineEmojiAssetPaths = ["en/data.json", "en/messages.json", "zh/data.json", "zh/messages.json"].map((file) => `${base}/${file}`);

export function offlineEmojiAssets() {
  const read = (file) => readFileSync(file, "utf8");
  const english = read(require.resolve("emojibase-data/en/data.json"));
  const englishByHexcode = new Map(JSON.parse(english).map((entry) => [entry.hexcode, entry]));
  const chinese = JSON.parse(read(require.resolve("emojibase-data/zh/data.json"))).map((entry) => {
    const translation = englishByHexcode.get(entry.hexcode);
    if (!translation) return entry;
    return { ...entry, tags: [...(entry.tags ?? []), translation.label, ...(translation.tags ?? [])] };
  });
  const sources = [english, read(require.resolve("emojibase-data/en/messages.json")), JSON.stringify(chinese), read(require.resolve("emojibase-data/zh/messages.json"))];
  const assets = new Map(offlineEmojiAssetPaths.map((path, index) => [path, sources[index]]));
  // Frimousse requests its datasets directly. Serve the same local JSON in dev and packaged builds.
  return {
    name: "huhu-offline-emoji",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const data = assets.get(request.url?.split("?")[0]);
        if (data === undefined || (request.method !== "GET" && request.method !== "HEAD")) return next();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(request.method === "HEAD" ? undefined : data);
      });
    },
    generateBundle() {
      for (const [path, source] of assets) this.emitFile({ type: "asset", fileName: path.slice(1), source });
    },
  };
}
