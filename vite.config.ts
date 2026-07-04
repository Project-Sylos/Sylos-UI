import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

import { applyGoogleOAuthEnv } from "./vite/loadGoogleOAuthEnv";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const googleOAuth =
    mode === "development" ? applyGoogleOAuthEnv(env) : null;

  if (googleOAuth && mode === "development") {
    const label =
      googleOAuth.source === ".env / environment"
        ? ".env.local / environment"
        : googleOAuth.source.replace(process.cwd(), ".");
    console.log(`[sylos] Google OAuth loaded from ${label}`);
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
