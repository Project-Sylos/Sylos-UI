/// <reference types="vite/client" />

// Electron API types
interface Window {
  electronAPI?: {
    openDirectoryDialog: (title?: string) => Promise<string | null>;
  };
  sylos?: {
    gpuDisabled: boolean;
  };
  __SYLOS_GPU_DISABLED__?: boolean;
}

declare module "*.png";
declare module "*.mp4";
