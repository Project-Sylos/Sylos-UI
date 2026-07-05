import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

import { applyGoogleOAuthEnv } from "./vite/loadGoogleOAuthEnv";
import { applyDropboxOAuthEnv } from "./vite/loadDropboxOAuthEnv";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const googleOAuth =
    mode === "development" ? applyGoogleOAuthEnv(env) : null;
  const dropboxOAuth =
    mode === "development" ? applyDropboxOAuthEnv(env) : null;

  if (mode === "development") {
    if (googleOAuth) {
      const label =
        googleOAuth.source === ".env / environment"
          ? ".env.local / environment"
          : googleOAuth.source.replace(process.cwd(), ".");
      console.log(`[sylos] Google OAuth loaded from ${label}`);
    }
    if (dropboxOAuth) {
      const label =
        dropboxOAuth.source === ".env / environment"
          ? ".env.local / environment"
          : dropboxOAuth.source.replace(process.cwd(), ".");
      console.log(`[sylos] Dropbox OAuth loaded from ${label}`);
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: "127.0.0.1",
      open: true,
    },
  };
});
