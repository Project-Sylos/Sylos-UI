import { Folder } from "../types/services";

function basename(path: string): string {
  const trimmed = path.replace(/[\\/]$/, "");
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : trimmed || "/";
}

/**
 * Open a directory picker using the web File System Access API or fallback to input element
 */
export async function pickLocalFolder(title: string): Promise<Folder | null> {
  try {
    let path: string | null = null;

    // Try modern File System Access API first (Chrome/Edge)
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({
          mode: 'read',
        });
        // Get the path from the directory handle
        // Note: The File System Access API doesn't expose full paths for security,
        // so we'll use the directory name
        path = dirHandle.name;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('File System Access API failed, falling back to input:', err);
        } else {
          // User cancelled
          return null;
        }
      }
    }

    // Fallback to input element with webkitdirectory
    if (!path) {
      path = await new Promise<string | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.style.display = 'none';
        
        input.onchange = (e: Event) => {
          const target = e.target as HTMLInputElement;
          const files = target.files;
          if (files && files.length > 0) {
            // Get the directory path from the first file
            const firstFile = files[0];
            const fullPath = (firstFile as any).webkitRelativePath || firstFile.name;
            const dirPath = fullPath.split('/')[0] || fullPath.split('\\')[0];
            resolve(dirPath);
          } else {
            resolve(null);
          }
          document.body.removeChild(input);
        };

        input.oncancel = () => {
          resolve(null);
          document.body.removeChild(input);
        };

        document.body.appendChild(input);
        input.click();
      });
    }

    if (!path) {
      return null;
    }

    const name = basename(path);

    return {
      Id: path,
      ServiceID: path,
      name: name,
      locationPath: "/",
      parentId: "",
      parentPath: "",
      lastUpdated: new Date().toISOString(),
      depthLevel: 0,
      type: "folder",
    };
  } catch (error) {
    console.error("Failed to open directory picker", error);
    return null;
  }
}

