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

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 72;

/** Returns a student-friendly problem with the password, or null when it is acceptable. */
export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Include at least one letter and one number.";
  }
  if (/^(.)\1+$/.test(password)) return "Choose a password that is harder to guess.";
  return null;
}

/**
 * Password lifecycle flags live in the auth user's app_metadata, which only the server can write:
 * `must_change_password` gates the portal until a personal password is set, and
 * `password_reset_request` holds a student's pending "I forgot my password" enquiry.
 */
export function readPasswordState(appMetadata: Record<string, unknown> | null | undefined) {
  const request = appMetadata?.["password_reset_request"];
  const record = request && typeof request === "object" ? (request as Record<string, unknown>) : {};
  const requestedAt = typeof record["requested_at"] === "string" ? record["requested_at"] : null;
  const changedAt = appMetadata?.["password_changed_at"];
  return {
    mustChange: appMetadata?.["must_change_password"] === true,
    requestedAt: requestedAt && Number.isFinite(Date.parse(requestedAt)) ? requestedAt : null,
    note: typeof record["note"] === "string" ? record["note"] : "",
    changedAt:
      typeof changedAt === "string" && Number.isFinite(Date.parse(changedAt)) ? changedAt : null,
  };
}
