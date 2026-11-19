import emojis from "emojibase-data/en/data.json";
import messages from "emojibase-data/en/messages.json";
import { registerHostRoutes } from "./host-fetch";

export function registerOfflineEmojiRoutes(): () => void {
  return registerHostRoutes({
    "GET /api/local-emoji/en/data.json": () => emojis,
    "GET /api/local-emoji/en/messages.json": () => messages,
  });
}
