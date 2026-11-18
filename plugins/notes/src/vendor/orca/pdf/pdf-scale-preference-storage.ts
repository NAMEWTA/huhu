// 摘取自 ORCA（MIT，commit 7041ea02）：pdf-scale-preference-storage.ts + file-view-preference-storage.ts（合并，只留读写）。改动见 PATCHES.md。
import type { PdfScalePreference } from "./pdf-scale-preference";

const MAX_PREFERENCES = 100;
const MAX_STORAGE_LENGTH = 2 * 1024 * 1024;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readPreferences(target: Storage, key: string): Record<string, unknown> {
  try {
    const raw = target.getItem(key);
    if (!raw || raw.length > MAX_STORAGE_LENGTH) {
      return {};
    }
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).slice(-MAX_PREFERENCES)) : {};
  } catch {
    return {};
  }
}

function savePreferences(target: Storage, storageKey: string, preferences: Record<string, unknown>): boolean {
  const keys = Object.keys(preferences);
  let serialized = JSON.stringify(preferences);
  while (keys.length > MAX_PREFERENCES || serialized.length > MAX_STORAGE_LENGTH) {
    const oldest = keys.shift();
    if (oldest === undefined) {
      return false;
    }
    delete preferences[oldest];
    serialized = JSON.stringify(preferences);
  }
  try {
    target.setItem(storageKey, serialized);
    return true;
  } catch {
    // Preferences must not prevent using the viewer when storage is unavailable.
    return false;
  }
}

export function readFileViewPreference(storageKey: string, fileKey: string): unknown {
  const target = storage();
  return target ? readPreferences(target, storageKey)[fileKey] : undefined;
}

export function writeFileViewPreference(storageKey: string, fileKey: string, value: unknown): void {
  const target = storage();
  if (!target) {
    return;
  }
  const preferences = readPreferences(target, storageKey);
  delete preferences[fileKey];
  preferences[fileKey] = value;
  savePreferences(target, storageKey, preferences);
}

export const PDF_SCALE_PREFERENCES_STORAGE_KEY = "huhu.pdf.scale-preferences.v1";

/** 偏好键：Vault + 路径（不同 Vault 的同名文件互不影响）。 */
export function buildPdfScalePreferenceKey(input: { vaultId: string; filePath: string }): string {
  return JSON.stringify([input.vaultId, input.filePath]);
}

export function readPdfScalePreference(preferenceKey: string): PdfScalePreference | null {
  const value = readFileViewPreference(PDF_SCALE_PREFERENCES_STORAGE_KEY, preferenceKey);
  return value === "page-width" || (typeof value === "number" && Number.isFinite(value)) ? value : null;
}

export function writePdfScalePreference(preferenceKey: string, preference: PdfScalePreference): void {
  writeFileViewPreference(PDF_SCALE_PREFERENCES_STORAGE_KEY, preferenceKey, preference);
}
