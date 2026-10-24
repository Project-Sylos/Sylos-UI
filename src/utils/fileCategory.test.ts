import { describe, expect, it } from "vitest";
import {
  categoryForExtension,
  categoryForFileName,
  extensionOf,
} from "./fileCategory";

describe("fileCategory", () => {
  it("parses extension from basename and paths", () => {
    expect(extensionOf("report.PDF")).toBe("pdf");
    expect(extensionOf("/a/b/photo.jpeg")).toBe("jpeg");
    expect(extensionOf("noext")).toBe("");
    // Same rule as Go ExtensionOf: leading-dot names still yield a suffix.
    expect(extensionOf(".hidden")).toBe("hidden");
  });

  it("maps known extensions to filter categories", () => {
    expect(categoryForExtension("docx")).toBe("document");
    expect(categoryForExtension(".xlsx")).toBe("spreadsheet");
    expect(categoryForExtension("pptx")).toBe("presentation");
    expect(categoryForExtension("png")).toBe("image");
    expect(categoryForExtension("mp4")).toBe("video");
    expect(categoryForExtension("mp3")).toBe("audio");
    expect(categoryForExtension("zip")).toBe("archive");
    expect(categoryForExtension("ts")).toBe("code");
    expect(categoryForExtension("pdf")).toBe("pdf");
  });

  it("falls back to other for unknown or junk-style extensions", () => {
    expect(categoryForFileName("notes.xyz123")).toBe("other");
    expect(categoryForFileName("cache.tmp")).toBe("other");
    expect(categoryForFileName("README")).toBe("other");
  });
});
