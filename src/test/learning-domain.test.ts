import { describe, expect, it } from "vitest";

import { detectLearningKind, isRecentlyDeleted, titleFromFilename } from "@/lib/learning-domain";

describe("learning content rules", () => {
  it.each([
    ["student-guide.pdf", "pdf"],
    ["training.mp4", "video"],
    ["training.mov", "video"],
    ["lesson.mp3", "audio"],
    ["lesson.m4a", "audio"],
    ["lesson.wav", "audio"],
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