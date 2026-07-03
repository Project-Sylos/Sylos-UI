/// <reference types="vite/client" />

// Web API types
interface Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

declare module "*.png";
declare module "*.mp4";
