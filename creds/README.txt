Cloud OAuth credentials (gitignored)

Google Drive - place your Google Cloud OAuth client JSON as:

  creds/google-oauth.json

Use the JSON downloaded from Google Cloud Console (Desktop or Web client).
The file may use a top-level "installed" or "web" object - both work.

Or set in Sylos-UI/.env.local:

  VITE_GOOGLE_CLIENT_ID=...
  VITE_GOOGLE_CLIENT_SECRET=...

Dropbox - place app credentials JSON as:

  creds/dropbox-oauth.json

Use a Full Dropbox app (not App folder). JSON may be a flat object with
client_id and client_secret, or use the same installed/web wrapper shape.

Or set in Sylos-UI/.env.local:

  VITE_DROPBOX_CLIENT_ID=...
  VITE_DROPBOX_CLIENT_SECRET=...

.env.local overrides JSON files when both are present.
JSON auto-loading runs in `npm run dev` only (not production builds).

Do not commit real credentials.
