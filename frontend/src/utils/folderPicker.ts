import { openDirectoryDialog } from "./electron";
import { Folder } from "../types/services";

function basename(path: string): string {
  const trimmed = path.replace(/[\\/]$/, "");
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : trimmed || "/";
}

export async function pickLocalFolder(title: string): Promise<Folder | null> {
  try {
    const result = await openDirectoryDialog(title);
    if (!result) {
      return null;
    }

    const name = basename(result);

    return {
      id: result,
      displayName: name,
      // locationPath stays "/" for depth-level 0 roots
      locationPath: "/",
      parentId: "",
      parentPath: "",
      lastUpdated: new Date().toISOString(),
      depthLevel: 0,
      type: "folder",
    };
  } catch (error) {
    console.error("Failed to open directory dialog", error);
    return null;
  }
}

