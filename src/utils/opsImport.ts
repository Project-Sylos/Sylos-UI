import { zipStore } from "./zipStore";

export type OpsImportPayload = {
  /** Zip blob ready to upload */
  zip: Blob;
  /** Migration id derived from folder or zip name */
  migrationId: string;
  /** Display name for success messages */
  label: string;
};

function stripOpsName(name: string): string {
  let base = name.replace(/[/\\]+$/, "");
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  if (slash >= 0) base = base.slice(slash + 1);
  if (base.toLowerCase().endsWith(".zip")) base = base.slice(0, -4);
  if (base.toLowerCase().endsWith(".ops")) base = base.slice(0, -4);
  return base;
}

function pickZipFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.style.display = "none";
    const cleanup = () => {
      if (input.parentNode === document.body) document.body.removeChild(input);
    };
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

function pickOpsFolderFiles(): Promise<{ folderName: string; files: File[] } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.setAttribute("webkitdirectory", "");
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.style.display = "none";
    const cleanup = () => {
      if (input.parentNode === document.body) document.body.removeChild(input);
    };
    input.addEventListener("change", () => {
      const list = input.files;
      cleanup();
      if (!list || list.length === 0) {
        resolve(null);
        return;
      }
      const files = Array.from(list);
      const rel = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || files[0].name;
      const folderName = rel.split(/[/\\]/)[0] || "migration";
      resolve({ folderName, files });
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

async function folderToZip(folderName: string, files: File[]): Promise<Blob> {
  const entries: { path: string; data: Uint8Array }[] = [];
  const prefix = folderName.replace(/[/\\]+$/, "") + "/";
  for (const file of files) {
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    let path = rel;
    if (path.startsWith(prefix)) path = path.slice(prefix.length);
    if (!path || path.endsWith("/")) continue;
    const buf = new Uint8Array(await file.arrayBuffer());
    entries.push({ path: path.replace(/\\/g, "/"), data: buf });
  }
  return zipStore(entries);
}

/**
 * Prompt the user to import either a .zip (Sylos export) or an unpacked ops folder.
 * Returns a zip blob + derived migration id for POST /migrations/db/upload.
 */
export async function pickOpsImport(
  mode: "zip" | "folder"
): Promise<OpsImportPayload | null> {
  if (mode === "zip") {
    const file = await pickZipFile();
    if (!file) return null;
    return {
      zip: file,
      migrationId: stripOpsName(file.name),
      label: file.name,
    };
  }

  const picked = await pickOpsFolderFiles();
  if (!picked) return null;
  const zip = await folderToZip(picked.folderName, picked.files);
  return {
    zip,
    migrationId: stripOpsName(picked.folderName),
    label: picked.folderName,
  };
}
