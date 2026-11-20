export const SAFE_TAG_COLORS = ["blue", "green", "orange", "purple"] as const;
export type SafeTagColor = (typeof SAFE_TAG_COLORS)[number];
