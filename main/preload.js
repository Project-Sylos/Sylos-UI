const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  openDirectoryDialog: (title) =>
    ipcRenderer.invoke("open-directory-dialog", { title }),
});

// Expose GPU status to renderer
// Check if GPU is disabled (set by main process via environment variable)
const gpuDisabled = process.env.SYLOS_GPU_DISABLED === "1";

contextBridge.exposeInMainWorld("sylos", {
  gpuDisabled: gpuDisabled,
});

