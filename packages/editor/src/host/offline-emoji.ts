import emojis from "emojibase-data/en/data.json";
import messages from "emojibase-data/en/messages.json";
import { registerHostRoutes } from "./host-fetch";

async function loadChineseEmoji() {
  const { default: chineseEmoji } = await import("emojibase-data/zh/data.json");
  const englishByHexcode = new Map(emojis.map((entry) => [entry.hexcode, entry]));
  return chineseEmoji.map((entry) => {
    const english = englishByHexcode.get(entry.hexcode);
    if (!english) return entry;
    return { ...entry, tags: [...(entry.tags ?? []), english.label, ...(english.tags ?? [])] };
  });
}

export function registerOfflineEmojiRoutes(): () => void {
  return registerHostRoutes({
    "GET /api/local-emoji/en/data.json": () => emojis,
    "GET /api/local-emoji/en/messages.json": () => messages,
    "GET /api/local-emoji/zh/data.json": loadChineseEmoji,
    "GET /api/local-emoji/zh/messages.json": async () => (await import("emojibase-data/zh/messages.json")).default,
  });
}
