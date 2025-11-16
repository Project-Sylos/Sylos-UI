// Type-safe Electron API interface
declare global {
  interface Window {
    electronAPI?: {
      openDirectoryDialog: (title?: string) => Promise<string | null>;
    };
  }
}

/**
 * Check if Electron API is available
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI;
}

/**
 * Open directory dialog using Electron IPC
 */
export async function openDirectoryDialog(
  title?: string
): Promise<string | null> {
  if (!isElectron() || !window.electronAPI) {
    throw new Error("Electron API not available");
  }

  return window.electronAPI.openDirectoryDialog(title);
}

