export type LearningKind = "pdf" | "video" | "audio";

const fileKinds: Record<string, LearningKind> = {
  pdf: "pdf",
  mp4: "video",
  mov: "video",
  m4v: "video",
  webm: "video",
  mp3: "audio",
  m4a: "audio",
  wav: "audio",
};

export function detectLearningKind(filename: string): LearningKind | null {
  const extension = filename.split(".").at(-1)?.toLowerCase();
  return extension ? (fileKinds[extension] ?? null) : null;
}

export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRecentlyDeleted(deletedAt: string, now = Date.now()): boolean {
  const deletedTime = Date.parse(deletedAt);
  const retentionMs = 30 * 24 * 60 * 60 * 1000;
  return Number.isFinite(deletedTime) && now - deletedTime < retentionMs && now >= deletedTime;
}