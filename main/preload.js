const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  openDirectoryDialog: (title) =>
    ipcRenderer.invoke("open-directory-dialog", { title }),
});

// Expose GPU status to renderer
// On Windows, always allow WebGL attempts (never disable)
// On other platforms, check environment variable
const gpuDisabled = process.platform !== "win32" && process.env.SYLOS_GPU_DISABLED === "1";

contextBridge.exposeInMainWorld("sylos", {
  gpuDisabled: gpuDisabled,
});

