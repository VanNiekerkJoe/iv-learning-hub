export type LearningKind = "pdf" | "video" | "audio";

export const STARTER_MODULES = [
  {
    title: "Induction",
    description: "Start here to learn about the course and how to get started.",
    position: 0,
  },
  ...Array.from({ length: 6 }, (_, index) => ({
    title: `Module ${index + 1}`,
    description: "Course materials will be added by your administrator.",
    position: index + 1,
  })),
];

const fileKinds: Record<string, LearningKind> = {
  pdf: "pdf",
  mp4: "video",
  mov: "video",
  m4v: "video",
  webm: "video",
  mp3: "audio",
  m4a: "audio",
  wav: "audio",
  pptx: "pdf",
  ppt: "pdf",
  docx: "pdf",
  doc: "pdf",
  rtf: "pdf",
  txt: "pdf",
  csv: "pdf",
  xlsx: "pdf",
  xls: "pdf",
  ods: "pdf",
  odp: "pdf",
  odt: "pdf",
  gif: "pdf",
  webp: "pdf",
  jpg: "pdf",
  jpeg: "pdf",
  png: "pdf",
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
