import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
  source: string;
}

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.resolve(CONFIG_DIR, "..");

/** Standard Google Cloud OAuth client JSON (`web` or `installed` block). */
const CREDENTIAL_FILE_CANDIDATES = [
  path.join(UI_ROOT, "creds", "google-oauth.json"),
  path.join(UI_ROOT, "creds.json"),
  path.join(UI_ROOT, "..", "creds.json"),
];

function readCredentialBlock(raw: unknown): { client_id?: string; client_secret?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const block = record.web ?? record.installed ?? record;
  if (!block || typeof block !== "object") return null;
  const creds = block as Record<string, unknown>;
  if (typeof creds.client_id !== "string" || typeof creds.client_secret !== "string") {
    return null;
  }
  return {
    client_id: creds.client_id,
    client_secret: creds.client_secret,
  };
}

export function loadGoogleOAuthFromFiles(): GoogleOAuthCredentials | null {
  for (const filePath of CREDENTIAL_FILE_CANDIDATES) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      const block = readCredentialBlock(raw);
      if (!block?.client_id || !block.client_secret) continue;
      return {
        clientId: block.client_id,
        clientSecret: block.client_secret,
        source: filePath,
      };
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Env vars win; otherwise load from creds JSON files (development only). */
export function applyGoogleOAuthEnv(env: Record<string, string>): GoogleOAuthCredentials | null {
  const hasEnv =
    Boolean(env.VITE_GOOGLE_CLIENT_ID?.trim()) &&
    Boolean(env.VITE_GOOGLE_CLIENT_SECRET?.trim());

  if (hasEnv) {
    return {
      clientId: env.VITE_GOOGLE_CLIENT_ID!.trim(),
      clientSecret: env.VITE_GOOGLE_CLIENT_SECRET!.trim(),
      source: ".env / environment",
    };
  }

  const fromFile = loadGoogleOAuthFromFiles();
  if (!fromFile) return null;

  process.env.VITE_GOOGLE_CLIENT_ID = fromFile.clientId;
  process.env.VITE_GOOGLE_CLIENT_SECRET = fromFile.clientSecret;
  return fromFile;
}
