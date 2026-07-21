/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
  readonly VITE_DROPBOX_CLIENT_ID?: string;
  readonly VITE_DROPBOX_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Web API types
interface Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

declare module "*.png";
declare module "*.svg";
declare module "*.webp";
declare module "*.jpg";
declare module "*.jpeg";
declare module "*.mp4";
