import type { FileEntry } from "../shared/files.js";
import type { DevicePreferences } from "./device-preferences.js";

export function shownFileEntries(entries: readonly FileEntry[], filter: string, preferences: Pick<DevicePreferences, "showDotFiles">) {
  const query = filter.trim().toLowerCase();
  return entries.filter(({ name }) => (preferences.showDotFiles || !name.startsWith(".")) && name.toLowerCase().includes(query));
}
