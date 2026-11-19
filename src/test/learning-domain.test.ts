import { describe, expect, it } from "vitest";

import {
  detectLearningKind,
  isRecentlyDeleted,
  readPasswordState,
  titleFromFilename,
  validateNewPassword,
} from "@/lib/learning-domain";
import { applyPreferences, DEFAULT_PREFERENCES, normalizePreferences } from "@/lib/preferences";

describe("learning content rules", () => {
  it.each([
    ["student-guide.pdf", "pdf"],
    ["training.mp4", "video"],
    ["training.mov", "video"],
    ["lesson.mp3", "audio"],
    ["lesson.m4a", "audio"],
    ["lesson.wav", "audio"],
    ["report.odt", "pdf"],
    ["summary.csv", "pdf"],
    ["slides.odp", "pdf"],
    ["sheet.ods", "pdf"],
  ] as const)("detects %s as %s", (filename, kind) => {
    expect(detectLearningKind(filename)).toBe(kind);
  });

  it("rejects file types not offered by the course library", () => {
    expect(detectLearningKind("course.zip")).toBeNull();
  });

  it("uses a readable title from an uploaded filename", () => {
    expect(titleFromFilename("Module_2-Introduction.pdf")).toBe("Module 2 Introduction");
  });

  it("allows restoring content inside the 30-day deleted-items window only", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    expect(isRecentlyDeleted("2026-11-01T12:00:00Z", now)).toBe(true);
    expect(isRecentlyDeleted("2026-10-18T12:00:00Z", now)).toBe(false);
  });
});

describe("student password rules", () => {
  it("accepts a password with letters and numbers of sufficient length", () => {
    expect(validateNewPassword("Sunrise2026Learn")).toBeNull();
  });

  it.each(["short1A", "onlyletterspassword", "1234567890123", "aaaaaaaaaaaa"])(
    "rejects weak password %s",
    (password) => {
      expect(validateNewPassword(password)).not.toBeNull();
    },
  );

  it("treats a missing or malformed reset flag as no pending change", () => {
    const none = { mustChange: false, requestedAt: null, note: "", changedAt: null };
    expect(readPasswordState(undefined)).toEqual(none);
    expect(readPasswordState({ must_change_password: "yes", password_reset_request: "x" })).toEqual(
      none,
    );
  });

  it("reads a forced change, a pending reset request and the last change", () => {
    expect(
      readPasswordState({
        must_change_password: true,
        password_changed_at: "2026-11-01T08:00:00.000Z",
        password_reset_request: { requested_at: "2026-11-19T10:00:00.000Z", note: "Lost it" },
      }),
    ).toEqual({
      mustChange: true,
      requestedAt: "2026-11-19T10:00:00.000Z",
      note: "Lost it",
      changedAt: "2026-11-01T08:00:00.000Z",
    });
  });
});

describe("portal preferences", () => {
  it("falls back to defaults for missing or malformed stored values", () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({ reduceMotion: "yes", largeText: 1 })).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it("keeps valid choices and applies them to the document root", () => {
    const preferences = normalizePreferences({ reduceMotion: true, largeText: true, extra: 1 });
    expect(preferences).toEqual({ reduceMotion: true, largeText: true });
    const root = document.createElement("html");
    applyPreferences(preferences, root);
    expect(root.dataset["motion"]).toBe("reduced");
    expect(root.dataset["text"]).toBe("large");
    applyPreferences(DEFAULT_PREFERENCES, root);
    expect(root.dataset["motion"]).toBeUndefined();
    expect(root.dataset["text"]).toBeUndefined();
  });
});
