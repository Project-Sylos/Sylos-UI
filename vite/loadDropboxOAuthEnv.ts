import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  source: string;
}

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.resolve(CONFIG_DIR, "..");

const DROPBOX_OAUTH_PATH = path.join(UI_ROOT, "creds", "dropbox-oauth.json");

function readClientCredentials(raw: unknown): { client_id?: string; client_secret?: string } | null {
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

export function loadDropboxOAuthFromFiles(): OAuthCredentials | null {
  if (!fs.existsSync(DROPBOX_OAUTH_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(DROPBOX_OAUTH_PATH, "utf8")) as unknown;
    const block = readClientCredentials(raw);
    if (!block?.client_id || !block.client_secret) return null;
    return {
      clientId: block.client_id,
      clientSecret: block.client_secret,
      source: DROPBOX_OAUTH_PATH,
    };
  } catch {
    return null;
  }
}

/** Env vars win; otherwise load from creds/dropbox-oauth.json (development only). */
export function applyDropboxOAuthEnv(env: Record<string, string>): OAuthCredentials | null {
  const hasEnv =
    Boolean(env.VITE_DROPBOX_CLIENT_ID?.trim()) &&
    Boolean(env.VITE_DROPBOX_CLIENT_SECRET?.trim());

  if (hasEnv) {
    return {
      clientId: env.VITE_DROPBOX_CLIENT_ID!.trim(),
      clientSecret: env.VITE_DROPBOX_CLIENT_SECRET!.trim(),
      source: ".env / environment",
    };
  }

  const fromFile = loadDropboxOAuthFromFiles();
  if (!fromFile) return null;

  process.env.VITE_DROPBOX_CLIENT_ID = fromFile.clientId;
  process.env.VITE_DROPBOX_CLIENT_SECRET = fromFile.clientSecret;
  return fromFile;
}
