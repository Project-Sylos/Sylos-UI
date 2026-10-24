import {
  EXTENSION_PRESETS,
  MIMETYPE_CATEGORIES,
} from "./rulesets";

export type FileMimeCategory = (typeof MIMETYPE_CATEGORIES)[number];

const CATEGORY_IDS = new Set<string>(MIMETYPE_CATEGORIES);

/** Reverse map from EXTENSION_PRESETS (skips junk / non-category presets). */
const extensionCategory: Record<string, FileMimeCategory> = (() => {
  const map: Record<string, FileMimeCategory> = {};
  for (const preset of EXTENSION_PRESETS) {
    if (!CATEGORY_IDS.has(preset.id)) continue;
    const category = preset.id as FileMimeCategory;
    for (const ext of preset.extensions) {
      map[ext.toLowerCase()] = category;
    }
  }
  return map;
})();

/** Lower-case extension without a leading dot, or "". */
export function extensionOf(name: string): string {
  const base = name.includes("/") ? name.slice(name.lastIndexOf("/") + 1) : name;
  const i = base.lastIndexOf(".");
  if (i < 0 || i >= base.length - 1) return "";
  return base.slice(i + 1).toLowerCase();
}

/** Static category for an extension (with or without dot); unknown → other. */
export function categoryForExtension(ext: string): FileMimeCategory {
  const key = ext.trim().toLowerCase().replace(/^\./, "");
  if (!key) return "other";
  return extensionCategory[key] ?? "other";
}

/** Category derived from a file basename (folder callers should not use this). */
export function categoryForFileName(name: string): FileMimeCategory {
  return categoryForExtension(extensionOf(name));
}
