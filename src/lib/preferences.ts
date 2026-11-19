export type PortalPreferences = {
  reduceMotion: boolean;
  largeText: boolean;
};

export const DEFAULT_PREFERENCES: PortalPreferences = { reduceMotion: false, largeText: false };
export const PREFERENCES_STORAGE_KEY = "iv-learning-hub.preferences.v1";

/** Accepts anything (stored JSON, account metadata) and returns a complete, valid preference set. */
export function normalizePreferences(value: unknown): PortalPreferences {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    reduceMotion: record["reduceMotion"] === true,
    largeText: record["largeText"] === true,
  };
}

export function applyPreferences(preferences: PortalPreferences, root: HTMLElement) {
  if (preferences.reduceMotion) root.dataset["motion"] = "reduced";
  else delete root.dataset["motion"];
  if (preferences.largeText) root.dataset["text"] = "large";
  else delete root.dataset["text"];
}
